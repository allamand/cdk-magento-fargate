import {
  InterfaceVpcEndpointAwsService,
  Peer,
  Port,
  SecurityGroup,
  Vpc,
  SubnetType,
  InstanceType,
  InstanceClass,
  InstanceSize,
} from '@aws-cdk/aws-ec2';
import { AssetImage, Cluster, ContainerImage, ExecuteCommandLogging } from '@aws-cdk/aws-ecs';
import { AccessPoint, FileSystem, LifecyclePolicy, PerformanceMode, ThroughputMode } from '@aws-cdk/aws-efs';
import { CfnSubnetGroup, CfnCacheCluster } from '@aws-cdk/aws-elasticache';
import { Key } from '@aws-cdk/aws-kms';
import { LogGroup } from '@aws-cdk/aws-logs';
import * as opensearch from '@aws-cdk/aws-opensearchservice';
import { Credentials, DatabaseCluster, DatabaseClusterEngine, AuroraMysqlEngineVersion } from '@aws-cdk/aws-rds';
import { Bucket } from '@aws-cdk/aws-s3';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { CfnOutput, Construct, RemovalPolicy, Size, Stack, StackProps, Tags } from '@aws-cdk/core';
import * as cxapi from '@aws-cdk/cx-api';
import { MagentoService } from './magento';
import * as yaml from 'js-yaml';

//https://www.npmjs.com/package/@aws-cdk-containers/ecs-service-extensions?activeTab=readme
export interface MagentoStackProps extends StackProps {
  clusterName: string;
  createCluster: boolean; // Specify if you want to reuse existing ECS cluster, else it will create new one
}

/*
 ** Creation of the Stack
 */
export class MagentoStack extends Stack {
  constructor(scope: Construct, id: string, props: MagentoStackProps) {
    super(scope, id, props);
    const stack = Stack.of(this);
    //https://docs.aws.amazon.com/cdk/api/latest/docs/aws-ecs-patterns-readme.html#use-the-remove_default_desired_count-feature-flag
    stack.node.setContext(cxapi.ECS_REMOVE_DEFAULT_DESIRED_COUNT, true);

    const host='https://raw.githubusercontent.com';
    const uri = '/aws-observability/aws-otel-collector/main/deployment-template/eks/otel-container-insights-infra.yaml';
     const request = require('sync-request');
     const body = yaml.loadAll(request('GET', `${host}${uri}`).getBody())
       .filter((rbac: any) => {
         return rbac.kind != 'ServiceAccount' && rbac.kind != 'Namespace';
       });
    console.log(body);

    /*     const adotManifests = yaml
      .loadAll(
        request(
          'GET',
          'https://raw.githubusercontent.com/aws-observability/aws-otel-collector/main/deployment-template/eks/otel-container-insights-infra.yaml',
        ).done(function (res: any) {
          console.log(res);
          return res.getBody();
        }),
      )
      .filter((rbac: any) => {
        return rbac.kind != 'ServiceAccount' && rbac.kind != 'Namespace';
      });
    console.log(adotManifests); */

    //Create or Reuse VPC
    let stackName = this.stackName;
    var vpc = undefined;
    const vpcTagName = this.node.tryGetContext('vpc_tag_name') || undefined;
    if (vpcTagName) {
      if (vpcTagName == 'default') {
        vpc = Vpc.fromLookup(this, 'VPC', { isDefault: true });
      } else {
        vpc = Vpc.fromLookup(this, 'VPC', { tags: { Name: vpcTagName } });
      }
    } else {
      vpc = new Vpc(this, 'VPC', { maxAzs: 2 });
    }

    const enablePrivateLink = this.node.tryGetContext('enablePrivateLink');
    if (enablePrivateLink == 'true') {
      vpc.addInterfaceEndpoint('CWEndpoint', { service: InterfaceVpcEndpointAwsService.CLOUDWATCH });
      vpc.addInterfaceEndpoint('EFSEndpoint', { service: InterfaceVpcEndpointAwsService.ELASTIC_FILESYSTEM });
      vpc.addInterfaceEndpoint('SMEndpoint', { service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER });
    }

    // Create kms key for secure logging and secret store encryption
    // docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html
    const kmsKey = new Key(this, 'ECSKmsKey', {
      alias: id + '-kms-ecs-' + props.clusterName,
    });
    new CfnOutput(stack, 'EcsKMSAlias', { value: kmsKey.keyArn });

    // Secure ecs exec loggings
    const execLogGroup = new LogGroup(this, 'ECSExecLogGroup', {
      removalPolicy: RemovalPolicy.DESTROY,
      logGroupName: '/ecs/secu/exec/' + props.clusterName,
      encryptionKey: kmsKey,
    });
    new CfnOutput(stack, 'EcsExecLogGroupOut', { value: execLogGroup.logGroupName });
    const execBucket = new Bucket(this, 'EcsExecBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryptionKey: kmsKey,
    });
    new CfnOutput(stack, 'EcsExecBucketOut', { value: execBucket.bucketName });

    /**
     * Password Creations
     *
     */
    const magentoPassword = new secretsmanager.Secret(this, 'magentoAdminPassword', {
      secretName: id + '-magento',
      description: 'magento password for ' + stackName,
      encryptionKey: kmsKey,
      generateSecretString: {
        excludeCharacters: '|-,\'"',
        includeSpace: false,
        excludePunctuation: true,
      },
    });
    new CfnOutput(stack, 'MagentoAdminPasswordOutput', { value: magentoPassword.toString() });

    /* The master user password must
     * contain at least one uppercase letter, one lowercase letter, one number, and one special character.
     */
    const magentoOpensearchAdminPassword = new secretsmanager.Secret(this, 'opensearchAdminPassword', {
      secretName: id + '-magento-opensearch-admin-password',
      description: 'magento Opensearch Admin password for ' + stackName,
      encryptionKey: kmsKey,
      generateSecretString: {
        excludeCharacters: '|-,\'":@/<>;()[]{}/&`?#*.%$!~^_+',
        includeSpace: false,
        excludePunctuation: false,
      },
    });
    new CfnOutput(stack, 'MagentoOpensearchAdminPasswordOutput', {
      value: magentoOpensearchAdminPassword.toString(),
    });

    const magentoDatabasePassword = new secretsmanager.Secret(this, 'MagentoDatabasePassword', {
      secretName: id + '-magento-database-password',
      description: 'magento Database password for ' + stackName,
      encryptionKey: kmsKey,
      generateSecretString: {
        excludeCharacters: '|-,\'":@/<>;',
        includeSpace: false,
        excludePunctuation: true,
      },
    });
    new CfnOutput(stack, 'MagentoDatabasePasswordOutput', { value: magentoDatabasePassword.toString() });

    // Create or Reuse ECS Cluster
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
       ** Create new ECS Cluster witrh ecs exec logging enable
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

    /*
     ** Configure Flows security group in VPC
     */
    const efsFileSystemSecurityGroup = new SecurityGroup(this, 'EfsFileSystemSecurityGroup', { vpc });

    //NFS security group which used for ec2 to copy file
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
    const rdsSG = new SecurityGroup(this, 'magentoRDSSecurityGroup', {
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

    // Fargatge Service Security Group
    const serviceSG = new SecurityGroup(this, 'serviceSecurityGroup', {
      vpc: vpc,
      description: 'ecs service securitygroup',
      allowAllOutbound: true,
    });
    efsFileSystemSecurityGroup.addIngressRule(serviceSG, Port.tcp(2049));

    /*
     ** Create RDS Aurora Mysql database
     */
    const DB_NAME = this.node.tryGetContext('db_name') ? this.node.tryGetContext('db_name') : stackName;
    const DB_USER = this.node.tryGetContext('db_user') ? this.node.tryGetContext('db_user') : 'magentouser';
    //const DB_PASSWORD = this.node.tryGetContext('db_password') ? this.node.tryGetContext('db_password') : 'Passw00rd!';

    //const secret = SecretValue.plainText(magentoDatabasePassword.toString());
    const secret = magentoDatabasePassword.secretValue;
    const db = new DatabaseCluster(this, 'MagentoAuroraCluster', {
      engine: DatabaseClusterEngine.auroraMysql({ version: AuroraMysqlEngineVersion.VER_2_10_1 }),
      credentials: Credentials.fromPassword(DB_USER, secret),
      removalPolicy: RemovalPolicy.DESTROY,
      instances: 1,
      instanceProps: {
        vpc: vpc,
        instanceType: InstanceType.of(InstanceClass.MEMORY6_GRAVITON, InstanceSize.LARGE),
        securityGroups: [rdsSG],
      },
      defaultDatabaseName: DB_NAME,
    });

    const privateSubnetIds = vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_NAT }).subnetIds;

    const elastiCacheSecurityGroup = new SecurityGroup(this, 'ElasticacheSecurityGroup', {
      vpc: vpc,
      description: 'Allow Redis port from ECS',
      allowAllOutbound: true,
    });

    elastiCacheSecurityGroup.addIngressRule(serviceSG, Port.tcp(6379));

    const subnetGroup = new CfnSubnetGroup(this, 'RedisClusterPrivateSubnetGroup', {
      cacheSubnetGroupName: `${stackName}-redis-cache`,
      subnetIds: privateSubnetIds,
      description: 'Private Subnet Group for Magento Elasticache',
    });

    const redis = new CfnCacheCluster(this, 'RedisCluster', {
      engine: 'redis',
      cacheNodeType: 'cache.r6g.large',
      numCacheNodes: 1,
      clusterName: 'magento-elasticache',
      vpcSecurityGroupIds: [elastiCacheSecurityGroup.securityGroupId],
      cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
    });
    redis.addDependsOn(subnetGroup);

    /*
     ** Create OpenSearch cluster with fine-grained access control only
     * https://code.amazon.com/packages/D16GConstructsCDK/blobs/mainline/--/src/aws-elasticsearch/elasticsearch.ts
     * **
     * If a resource-based access policy contains IAM users or roles, clients must send signed requests using AWS Signature Version 4.
     * As such, access policies can conflict with fine-grained access control, especially if you use the internal user database and
     * HTTP basic authentication. You can't sign a request with a user name and password and IAM credentials. In general, if you enable
     * fine-grained access control, we recommend using a domain access policy that doesn't require signed requests.
     *
     */
    const OS_DOMAIN = this.node.tryGetContext('os_domain') ? this.node.tryGetContext('os_domain') : stackName;
    const OS_MASTER_USER_NAME = this.node.tryGetContext('os_master_user_name')
      ? this.node.tryGetContext('os_master_user_name')
      : 'magento-os-master';

    const OS_DOMAIN_ENDPOINT = this.node.tryGetContext('os_domain_endpoint')
      ? this.node.tryGetContext('os_domain_endpoint')
      : undefined;

    var osDomain;
    if (OS_DOMAIN_ENDPOINT) {
      // If we uses an existing OpenSearch Domain
      osDomain = opensearch.Domain.fromDomainEndpoint(this, 'domainImport', OS_DOMAIN_ENDPOINT);
    } else {
      osDomain = new opensearch.Domain(this, 'Domain', {
        version: opensearch.EngineVersion.OPENSEARCH_1_0,
        domainName: OS_DOMAIN,
        //accessPolicies: [osPolicy], // Default No access policies for magento
        removalPolicy: RemovalPolicy.DESTROY,
        securityGroups: [openSearchSG],
        //If you want more capacity for Opensearch . default 1 instance r5.large.search datanode; no dedicated master nodes
        // capacity: {
        //   masterNodes: 5,
        //   dataNodes: 20,
        // },
        ebs: {
          volumeSize: 20,
        },
        //if you need, else only 1 az
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
          masterUserName: OS_MASTER_USER_NAME,
          masterUserPassword: magentoOpensearchAdminPassword.secretValue,
        },
        useUnsignedBasicAuth: true,
        enableVersionUpgrade: true,
      });
    }
    new CfnOutput(this, 'EsDomainEndpoint', { value: osDomain.domainEndpoint });
    new CfnOutput(this, 'EsDomainName', { value: osDomain.domainName });
    new CfnOutput(this, 'EsMasterUserPassword', { value: magentoOpensearchAdminPassword.secretValue.toString() });
    process.env.elasticsearch_host = osDomain.domainEndpoint;

    var createEFS: boolean = false; // By default I don't want EFS, it's too slow
    const contextCreateEFS = this.node.tryGetContext('createEFS');
    if (contextCreateEFS == 'yes' || contextCreateEFS == 'true') {
      createEFS = true;
    }
    var useEFS: boolean = false; // By default I don't want EFS, it's too slow
    const contextUseEFS = this.node.tryGetContext('useEFS');
    if (contextUseEFS == 'yes' || contextUseEFS == 'true') {
      useEFS = true;
    }
    var efsFileSystem: FileSystem;
    var fileSystemAccessPoint: AccessPoint;
    if (createEFS) {
      /*
       ** Create EFS File system
       */
      efsFileSystem = new FileSystem(this, 'FileSystem', {
        vpc,
        securityGroup: efsFileSystemSecurityGroup,
        performanceMode: PerformanceMode.GENERAL_PURPOSE,
        lifecyclePolicy: LifecyclePolicy.AFTER_30_DAYS,
        throughputMode: ThroughputMode.PROVISIONED,
        provisionedThroughputPerSecond: Size.mebibytes(1024),
        encrypted: true,
        removalPolicy: RemovalPolicy.DESTROY, //props.removalPolicy,
      });
      Tags.of(efsFileSystem).add('Name', this.stackName);

      /* I can't activate EFS AccessPoint because Magento init scripts are doing chown on the root volume which zre forbidden when using accesPoints */
      fileSystemAccessPoint = efsFileSystem.addAccessPoint('AccessPoint', {
        path: '/bitnami/magento',
        posixUser: {
          gid: '1', // daemon user of magento docker image
          uid: '1',
        },
        createAcl: {
          ownerGid: '1',
          ownerUid: '1',
          permissions: '777',
        },
      });
    }

    /*
     ** Create our Magento Service, Load Balancer and Lookup Certificates and route53_zone
     */
    var magentoImage: AssetImage;
    if (useEFS) {
      magentoImage = ContainerImage.fromAsset('./docker/', { file: 'Dockerfile' });
    } else {
      magentoImage = ContainerImage.fromAsset('./docker/', { file: 'Dockerfile.noefs' });
    }

    const magento = new MagentoService(this, 'MagentoService', {
      vpc: vpc,
      cluster: cluster!,
      magentoPassword: magentoPassword,
      magentoImage: magentoImage,
      useEFS: useEFS,
      efsFileSystem: efsFileSystem!,
      fileSystemAccessPoint: fileSystemAccessPoint!,
      db: db,
      dbUser: DB_USER,
      dbName: DB_NAME,
      dbPassword: magentoDatabasePassword,
      osDomain: osDomain,
      osUser: OS_MASTER_USER_NAME,
      osPassword: magentoOpensearchAdminPassword,
      kmsKey: kmsKey,
      execBucket: execBucket,
      execLogGroup: execLogGroup,
      serviceSG: serviceSG,
      cacheEndpoint: redis.attrRedisEndpointAddress,
    });

    //allow to communicate with OpenSearch
    openSearchSG.addIngressRule(serviceSG, Port.allTraffic(), 'allow traffic fom ECS service');
    serviceSG.addIngressRule(openSearchSG, Port.allTraffic(), 'allow traffic fom Opensearch');

    // Add Magento Admin Task
    const magentoAdminTask = this.node.tryGetContext('magento_admin_task');
    const magentoAdminTaskDebug = this.node.tryGetContext('magento_admin_task_debug')
      ? this.node.tryGetContext('magento_admin_task_debug')
      : 'no';
    if (magentoAdminTask == 'yes') {
      new MagentoService(this, 'MagentoServiceAdmin', {
        vpc: vpc,
        cluster: cluster!,
        magentoPassword: magentoPassword,
        magentoImage: magentoImage,
        useEFS: useEFS,
        efsFileSystem: efsFileSystem!,
        fileSystemAccessPoint: fileSystemAccessPoint!,
        db: db,
        dbUser: DB_USER,
        dbName: DB_NAME,
        dbPassword: magentoDatabasePassword,
        osDomain: osDomain,
        osUser: OS_MASTER_USER_NAME,
        osPassword: magentoOpensearchAdminPassword,
        serviceSG: serviceSG,
        kmsKey: kmsKey,
        execBucket: execBucket,
        execLogGroup: execLogGroup,
        magentoAdminTask: true,
        magentoAdminTaskDebug: magentoAdminTaskDebug,
        mainStackALB: magento.getALB(),
        cacheEndpoint: redis.attrRedisEndpointAddress,
      });
    }
  }
}
