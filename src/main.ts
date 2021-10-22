import { Peer, Port, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2';
import {
  AwsLogDriver,
  AwsLogDriverMode,
  Cluster,
  ContainerImage,
  ExecuteCommandLogging,
  FargateService,
  FargateTaskDefinition,
} from '@aws-cdk/aws-ecs';
import { ApplicationLoadBalancer, ListenerCertificate } from '@aws-cdk/aws-elasticloadbalancingv2';
import { Policy, PolicyStatement, Effect } from '@aws-cdk/aws-iam';
import { Key } from '@aws-cdk/aws-kms';
import { LogGroup } from '@aws-cdk/aws-logs';
import { Credentials, DatabaseCluster, DatabaseClusterEngine } from '@aws-cdk/aws-rds';
import { ARecord, HostedZone, RecordTarget } from '@aws-cdk/aws-route53';
import { LoadBalancerTarget } from '@aws-cdk/aws-route53-targets';
import { Bucket } from '@aws-cdk/aws-s3';
import { StringParameter } from '@aws-cdk/aws-ssm';
import { App, Construct, Stack, StackProps, CfnOutput, Duration, SecretValue, RemovalPolicy } from '@aws-cdk/core';
import { EksUtilsTask } from './eksutils';
import * as opensearch from '@aws-cdk/aws-opensearchservice';

//https://www.npmjs.com/package/@aws-cdk-containers/ecs-service-extensions?activeTab=readme
export interface MyStackProps extends StackProps {
  vpcTagName?: string; // Specify if you want to reuse existing VPC (or "default" for default VPC), else it will create a new one
  clusterName: string; // Specify if you want to reuse existing ECS cluster, else it will create new one
  createCluster: boolean;
  domainZone: string;
  domainName: string;
}

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: MyStackProps) {
    super(scope, id, props);
    const stack = Stack.of(this);
    // define resources here...



    //Define VPC
    var vpc = undefined;
    if (props.vpcTagName) {
      if (props.vpcTagName == 'default') {
        vpc = Vpc.fromLookup(this, 'VPC', { isDefault: true });
      } else {
        vpc = Vpc.fromLookup(this, 'VPC', { tags: { Name: props.vpcTagName } });
      }
    } else {
      vpc = new Vpc(this, 'VPC', { maxAzs: 2 });
    }

    //docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html
    // create kms key
    const kmsKey = new Key(this, 'ECSKmsKey', {
      alias: 'kms-ecs-' + props.clusterName,
    });
    new CfnOutput(stack, 'EcsKMSAlias', { value: kmsKey.keyArn });
    const execLogGroup = new LogGroup(this, 'ECSExecLogGroup', {
      removalPolicy: RemovalPolicy.DESTROY,
      logGroupName: '/ecs/secu/exec/' + props.clusterName,
      encryptionKey: kmsKey,
    });
    new CfnOutput(stack, 'EcsExecLogGroupOut', { value: execLogGroup.logGroupName });
    const execBucket = new Bucket(this, 'EcsExecBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      //encryption: BucketEncryption.KMS,
      encryptionKey: kmsKey,
    });
    new CfnOutput(stack, 'EcsExecBucketOut', { value: execBucket.bucketName });

    //Define ECS Cluster
    // Reference existing network and cluster infrastructure
    var cluster = undefined;
    if (!props.createCluster) {
      cluster = Cluster.fromClusterAttributes(this, 'Cluster', {
        clusterName: props.clusterName,
        vpc: vpc,
        securityGroups: [],
      });
    } else {
      /*
       ** Create new ECS Cluster
       */
      cluster = new Cluster(this, 'Cluster', {
        clusterName: props.clusterName,
        vpc,
        containerInsights: true,
        enableFargateCapacityProviders: true,
        executeCommandConfiguration: {
          kmsKey,
          logConfiguration: {
            cloudWatchLogGroup: execLogGroup,
            cloudWatchEncryptionEnabled: true,
            s3Bucket: execBucket,
            s3EncryptionEnabled: true,
            s3KeyPrefix: 'exec-command-output',
          },
          logging: ExecuteCommandLogging.OVERRIDE,
        },
      });
    }
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });

    //    var base = new MagentoOpensearch(this, 'opensearch', { vpc: vpc });
    //var DB_HOST = null;
    //var HTTP_HOST = null;
    const DB_NAME = 'magento';
    const DB_USER = 'magentouser';
    // const BASE_PATH = '/mnt/efs';
    // const ACCESSPOINT_PATH = '/wordpress';
    // const WORDPRESS_PATH = '/mnt/efs';
    //const KEY_NAME = this.node.tryGetContext('keyName') ? this.node.tryGetContext('keyName') : "magentokey";
    //const DOMAIN_NAME = this.node.tryGetContext('domainName') ? this.node.tryGetContext('domainName') : 'magento';
    const DB_PASSWORD = this.node.tryGetContext('dbPassword') ? this.node.tryGetContext('dbPassword') : 'Passw0rd!';
    /**
     * create security group in VPC
     */
    // NFS security group which used for ec2 to copy file
    const sgNFSSG = new SecurityGroup(this, 'NFSAllowAllSG', {
      vpc: vpc,
      description: 'allow 2049 inbound for ec2',
      allowAllOutbound: true,
    });
    sgNFSSG.addIngressRule(Peer.anyIpv4(), Port.tcp(2049), 'allow 2049 inbound from ec2');

    //ALB security group which allow 80 and 443
    const albSG = new SecurityGroup(this, 'albSG', {
      vpc: vpc,
      description: 'allow 80 and 443',
      allowAllOutbound: true,
    });
    albSG.addIngressRule(Peer.anyIpv4(), Port.tcp(80), 'allow 80 inbound');
    albSG.addIngressRule(Peer.anyIpv4(), Port.tcp(443), 'allow 443 inbound');

    //EC2 security group which allow port 22
    const ec2SG = new SecurityGroup(this, 'ec2SG', {
      vpc: vpc,
      description: 'allow 22 inbound for ec2',
      allowAllOutbound: true,
    });
    ec2SG.addIngressRule(Peer.anyIpv4(), Port.tcp(22), 'allow 22 inbound from ec2');

    // RDS security group which allow port 3306
    const rdsSG = new SecurityGroup(this, 'wordpressRdsSecurityGroup', {
      vpc: vpc,
      description: 'allow 3306 inbound',
      allowAllOutbound: true,
    });
    rdsSG.addIngressRule(Peer.anyIpv4(), Port.tcp(3306), 'allow 3306 inbound from lambda');

    // OpenSearch security group which allow port 3306
    const openSearchSG = new SecurityGroup(this, 'openSearchSecurityGroup', {
      vpc: vpc,
      description: 'allow All inbound',
      allowAllOutbound: true,
    });

    // OpenSearch security group which allow port 3306
    const serviceSG = new SecurityGroup(this, 'serviceSecurityGroup', {
      vpc: vpc,
      description: 'ecs service securitygroup',
      allowAllOutbound: true,
    });

    /*
     ** Create RDS Aurora Mysql database
     */
    const secret = SecretValue.plainText(DB_PASSWORD);
    const db = new DatabaseCluster(this, 'ServerlessWordpressAuroraCluster', {
      engine: DatabaseClusterEngine.AURORA_MYSQL,
      credentials: Credentials.fromPassword(DB_USER, secret),
      removalPolicy: RemovalPolicy.DESTROY,
      instanceProps: {
        vpc: vpc,
        securityGroups: [rdsSG],
      },
      defaultDatabaseName: DB_NAME,
    });
    //Connecto to DB
    //MARIADB_HOST=mariadb
    //MARIADB_ROOT_PASSWORD=
    //MARIADB_ROOT_USER = root;
    //mysql -h $MAGENTO_DATABASE_HOST -u $MAGENTO_DATABASE_USER -p$MAGENTO_DATABASE_PASSWORD $MAGENTO_DATABASE_NAME
    //mysql -h $MAGENTO_DATABASE_HOST -u $MAGENTO_DATABASE_USER -pPassw0rd! $MAGENTO_DATABASE_NAME
    //mysql -h $MAGENTO_DATABASE_HOST -u magentouser -pPassw0rd! magento
    //show databases;
    //show tables;
    ///opt/bitnami/scripts/magento/entrypoint.sh /opt/bitnami/scripts/magento/run.sh
    ///opt/bitnami/scripts/magento/setup.sh

    /***
     *  set the DB_HOST and HTTP_HOST which will used in the lambda environment
     */
    //DB_HOST = db.clusterEndpoint.hostname;

    /*
     ** Create OpenSearch
     * https://code.amazon.com/packages/D16GConstructsCDK/blobs/mainline/--/src/aws-elasticsearch/elasticsearch.ts
     * **
     * If a resource-based access policy contains IAM users or roles, clients must send signed requests using AWS Signature Version 4.
     * As such, access policies can conflict with fine-grained access control, especially if you use the internal user database and
     * HTTP basic authentication. You can't sign a request with a user name and password and IAM credentials. In general, if you enable
     * fine-grained access control, we recommend using a domain access policy that doesn't require signed requests.
     *
     */
    const elasticsearchDomain =
      this.node.tryGetContext('elasticsearch_domain') || process.env.elasticsearch_domain || 'magento-cdk';
    //const account = this.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
    // const osPolicy = new PolicyStatement({
    //   effect: Effect.ALLOW,
    //   actions: ['es:*'],
    //   resources: ['arn:aws:es:eu-west-1:' + account + ':domain/' + elasticsearchDomain + '/*'],
    //   //principals: [new AccountRootPrincipal()],
    //   principals: [new AnyPrincipal()],
    // });
    const esDomain = new opensearch.Domain(this, 'Domain', {
      version: opensearch.EngineVersion.OPENSEARCH_1_0,
      domainName: elasticsearchDomain,
      //accessPolicies: [osPolicy], // Default No access policies
      removalPolicy: RemovalPolicy.DESTROY,
      securityGroups: [openSearchSG],
      //default 1 r5.large.search datanode; no dedicated master nodes
      // capacity: {
      //   masterNodes: 5,
      //   dataNodes: 20,
      // },
      ebs: {
        volumeSize: 20,
      },
      //if you need
      // zoneAwareness: {
      //   availabilityZoneCount: 3,
      // },
      logging: {
        slowSearchLogEnabled: true,
        appLogEnabled: true,
        slowIndexLogEnabled: true,
      },

      //encryption
      enforceHttps: true,
      nodeToNodeEncryption: true,
      encryptionAtRest: {
        enabled: true,
      },
      fineGrainedAccessControl: {
        masterUserName: 'magento',
        masterUserPassword: DB_PASSWORD,
      },
      useUnsignedBasicAuth: true,
      enableVersionUpgrade: true,
    });

    const masterUserPassword = esDomain.masterUserPassword;
    new CfnOutput(this, 'EsDomainEndpoint', { value: esDomain.domainEndpoint });
    new CfnOutput(this, 'EsDomainName', { value: esDomain.domainName });
    new CfnOutput(this, 'EsMasterUserPassword', { value: masterUserPassword!.toString() });
    process.env.elasticsearch_host = esDomain.domainEndpoint;

    //Define TLS Certificate
    // Lookup pre-existing TLS certificate
    const certificateArn = StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + props.domainZone,
    }).stringValue;
    //const certificate = Certificate.fromCertificateArn(this, 'Cert', certificateArn);
    const certificate = ListenerCertificate.fromArn(certificateArn);

    //github.com/aws/aws-cdk/tree/master/packages/%40aws-cdk/aws-ecs
    const taskDefinition = new FargateTaskDefinition(this, 'TaskDef');

    //Create Load Balancer
    const lb = new ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: cluster.clusterName + '-magento',
    });
    const listener = lb.addListener('Listener', { port: 443 });
    listener.addCertificates('cert', [certificate]);
    
    const domainZone = HostedZone.fromLookup(this, 'Zone', { domainName: props.domainZone });
    const record = new ARecord(this, 'AliasRecord', {
      zone: domainZone,
      recordName: props.domainName + '.' + props.domainZone,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(lb)),
    });
    record.domainName;
    new CfnOutput(this, 'magentoURL', { value: "https://"+record.domainName });

    const container = taskDefinition.addContainer('magento', {
      image: ContainerImage.fromRegistry('docker.io/bitnami/magento:2'),
      logging: new AwsLogDriver({ streamPrefix: 'magento', mode: AwsLogDriverMode.NON_BLOCKING }),
      //executionRole: arn:aws:iam::382076407153:role/ecsTaskExecutionRole
      //taskRole:
      environment: {
        BITNAMI_DEBUG: 'yes',
        MAGENTO_HOST: lb.loadBalancerDnsName,
        MAGENTO_DATABASE_HOST: db.clusterEndpoint.hostname,
        MAGENTO_DATABASE_PORT_NUMBER: '3306',
        MAGENTO_DATABASE_USER: DB_USER,
        MAGENTO_DATABASE_PASSWORD: DB_PASSWORD,
        MAGENTO_DATABASE_NAME: 'magento',
        ELASTICSEARCH_HOST: esDomain.domainEndpoint,
        ELASTICSEARCH_PORT_NUMBER: '443',
        MAGENTO_ELASTICSEARCH_ENABLE_AUTH: 'yes',
        MAGENTO_ELASTICSEARCH_USER: 'magento',
        MAGENTO_ELASTICSEARCH_PASSWORD: masterUserPassword!.toString(),
      },
      memoryReservationMiB: 256,
      cpu: 256,
    });
    container.addPortMappings({
      containerPort: 8080,
    });
    // container.addToExecutionPolicy("arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy");
    //container.addToExecutionPolicy(ManagedPolicy.fromAwsManagedPolicyName("AmazonECSTaskExecutionRolePolicy"));
    container.addToExecutionPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: ['*'],
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
      }),
    );
    container.environmentFiles;

    //https://docs.aws.amazon.com/cdk/api/latest/docs/aws-ecs-readme.html
    const service = new FargateService(this, 'magentoService', {
      cluster,
      //serviceName: 'magento',
      taskDefinition,
      enableExecuteCommand: true,
      //circuitBreaker: { rollback: true },
      // cloudMapOptions: {
      //   // Create A records - useful for AWSVPC network mode.
      //   dnsRecordType: DnsRecordType.A,
      // },
      securityGroups: [serviceSG],
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 2,
        },
        {
          capacityProvider: 'FARGATE',
          weight: 1,
          base: 1,
        },
      ],
    });
    //allow to communicate with OpenSearch
    openSearchSG.addIngressRule(serviceSG, Port.allTraffic(), 'allow traffic fom ECS service');
    serviceSG.addIngressRule(openSearchSG, Port.allTraffic(), 'allow traffic fom Opensearch');

    new CfnOutput(stack, 'EcsExecCommandMagento', {
      value: `ecs_exec_service ${cluster.clusterName} ${service.serviceName} ${taskDefinition.defaultContainer?.containerName}`,
    });

    const targetGroup = listener.addTargets('montecarlo', {
      // priority: 1,
      // conditions: [
      //   ListenerCondition.hostHeaders([props.domainName + '.' + props.domainZone]),
      //   ListenerCondition.pathPatterns(['/*']),
      // ],
      port: 8080,
      targets: [service],
    });
    lb.addRedirect; //default to http -> https

    new CfnOutput(this, 'MagentoService', { value: service.serviceName });

    // SConfigure Load Balancer TargetGroups for peed up deployments
    targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30');
    targetGroup.configureHealthCheck({
      interval: Duration.seconds(125),
      healthyHttpCodes: '200',
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 10,
      timeout: Duration.seconds(120),
      path: '/',
    });

    var policyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      resources: ['*'],
      actions: ['ecs:ListTasks', 'ecs:DescribeTasks'],
    });

    service.taskDefinition.taskRole.attachInlinePolicy(
      new Policy(this, 'policy', {
        statements: [policyStatement],
      }),
    );

    //add Autoscaling
    const scaling = service.autoScaleTaskCount({ maxCapacity: 10 });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 50,
    });

    scaling.scaleOnRequestCount('RequestScaling', {
      requestsPerTarget: 10000,
      targetGroup: targetGroup,
    });

    new EksUtilsTask(this, 'eksutils', props, {
      vpc: vpc,
      cluster: cluster,
      name: 'eksutils',
      kmsKey: kmsKey,
      execBucket: execBucket,
      execLogGroup: execLogGroup,
    });
  }
}

// for development, use account/region from cdk cli
const stackName = 'magento';
const domainZone = process.env.DOMAIN_ZONE ? process.env.DOMAIN_ZONE : 'ecs.demo3.allamand.com';
const vpcTagName = process.env.VPC_TAG_NAME ? process.env.VPC_TAG_NAME : 'ecsworkshop-base/BaseVPC';
const clusterName = process.env.CLUSTER_NAME ? process.env.CLUSTER_NAME : stackName;
//const repoName = process.env.ECR_REPOSITORY ? process.env.ECR_REPOSITORY : 'allamand/ecsdemo-capacityproviders';
//const tag = process.env.IMAGE_TAG ? process.env.IMAGE_TAG : '1.0';

//TODO: add build and push within CDK

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new MyStack(app, stackName, {
  domainName: stackName,
  domainZone: domainZone,
  vpcTagName: vpcTagName,
  clusterName: clusterName,
  createCluster: true,
  env: devEnv,
});

// new MyStack(app, 'my-stack-prod', { env: prodEnv });

app.synth();
