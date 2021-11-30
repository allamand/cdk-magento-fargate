import { IVpc, Port } from '@aws-cdk/aws-ec2';
import {
  AwsLogDriver,
  ContainerImage, FargatePlatformVersion, FargateService, FargateTaskDefinition,
  ICluster,
  RepositoryImage
} from '@aws-cdk/aws-ecs';
import { NetworkLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import { FileSystem, IFileSystem } from '@aws-cdk/aws-efs';
import { ApplicationLoadBalancer, ListenerCertificate } from '@aws-cdk/aws-elasticloadbalancingv2';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { Key } from '@aws-cdk/aws-kms';
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs';
import { ARecord, HostedZone, RecordTarget } from '@aws-cdk/aws-route53';
import { LoadBalancerTarget } from '@aws-cdk/aws-route53-targets';
import { Bucket } from '@aws-cdk/aws-s3';
import { StringParameter } from '@aws-cdk/aws-ssm';
import { CfnOutput, Construct, Duration, RemovalPolicy, Stack } from '@aws-cdk/core';
import { MagentoStackProps } from './main';

const DEFAULTS = {
  eksutilsContainer: 'public.ecr.aws/seb-demo/eksutils',
};

/**
 * construct properties for EksUtils
 */
export interface ServiceTaskProps {
  /**
   * Vpc for the Service
   * @default - create a new VPC or use existing one
   */
  readonly vpc?: IVpc;

  /**
   * Amazon ECS cluster
   * @default - create a new cluster
   */
  readonly cluster: ICluster;

  /**
   * Service Name
   *
   */
  readonly name: string;

  /**
   * Amazon EFS filesystem
   * @default - ceate a new filesystem
   */
  readonly efsFilesystem?: IFileSystem;

  /**
   * container image for the service
   * @default - public.ecr.aws/d7p2r8s3/apisix
   */
  readonly serviceContainer?: ContainerImage;

  /**
   * KMS Key to encrypt SSM sessions and bucket
   * @default - public.ecr.aws/d7p2r8s3/apisix
   */
  readonly kmsKey: Key;

  /**
   * Bucket to store ecs exec commands
   * @default -
   */
  readonly execBucket: Bucket;

  /**
   * Log group to log ecs exec commands
   * @default - '/ecs/secu/exec/' + cluster.clusterName,
   */
  readonly execLogGroup: LogGroup;
}

/**
 * options for createWebService
 */
export interface WebServiceOptions {
  readonly image?: RepositoryImage;
  readonly port?: number;
  readonly environment?: {
    [key: string]: string;
  };
}

/*
 * Create EKSUtils taks in the cluster
 */
export class EksUtilsTask extends Construct {
  readonly vpc: IVpc;
  readonly name: string;
  readonly cluster: ICluster;
  readonly envVar: { [key: string]: string };
  constructor(scope: Construct, id: string, clusterProps: MagentoStackProps, props: ServiceTaskProps) {
    super(scope, id);

    const stack = Stack.of(this);
    this.vpc = props.vpc!;
    const vpc = this.vpc;
    this.name = props.name;
    const name = this.name;
    const cluster = props.cluster!;
    this.cluster = cluster;

    this.envVar = {
      //ADMIN_KEY_ADMIN: stack.node.tryGetContext('ADMIN_KEY_ADMIN'),
      //ADMIN_KEY_VIEWER: stack.node.tryGetContext('ADMIN_KEY_VIEWER'),
      //ETCD_HOST: stack.node.tryGetContext('ETCD_HOST') || '0.0.0.0',
      //ETCD_PORT: stack.node.tryGetContext('ETCD_PORT') || '2379',
      //DASHBOARD_ADMIN_PASSWORD: stack.node.tryGetContext('DASHBOARD_ADMIN_PASSWORD'),
      //DASHBOARD_USER_PASSWORD: stack.node.tryGetContext('DASHBOARD_USER_PASSWORD'),
    };

    /**
     * Amazon EFS filesystem for etcd
     */
    const fs = props.efsFilesystem ?? this._createEfsFilesystem();

    const task = new FargateTaskDefinition(this, props.name + 'Task', {
      memoryLimitMiB: 512,
      cpu: 256,
    });
    const container = task.addContainer(props.name, {
      image: ContainerImage.fromRegistry(DEFAULTS.eksutilsContainer),
      logging: new AwsLogDriver({
        streamPrefix: '/ecs/' + name + '/',
        logRetention: RetentionDays.ONE_DAY,
      }),
      // environment: {
      //   ADMIN_KEY_ADMIN: this.envVar.ADMIN_KEY_ADMIN,
      //   ADMIN_KEY_VIEWER: this.envVar.ADMIN_KEY_VIEWER,
      // },
    });
    container.addPortMappings({
      containerPort: 8080,
    });

    task.addVolume({
      name: 'efs',
      efsVolumeConfiguration: {
        fileSystemId: fs.fileSystemId,
      },
    });
    container.addMountPoints({
      containerPath: '/efs_data',
      sourceVolume: 'efs',
      readOnly: false,
    });
    //    eksutils.addContainerDependencies({
    //   container: etcdContainer,
    //   condition: ecs.ContainerDependencyCondition.START,
    // });

    task.addToExecutionRolePolicy(
      new PolicyStatement({
        actions: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'],
        resources: [
          stack.formatArn({
            service: 'elasticfilesystem',
            resource: 'file-system',
            sep: '/',
            resourceName: fs.fileSystemId,
          }),
        ],
      }),
    );

    /*
    ** we shoulds also used
    const svc = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'NginxService', {
      taskDefinition: task,
      cluster,
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
    });
    */
    const service = new FargateService(this, props.name + 'Service', {
      cluster,
      serviceName: props.name, // when specifying service name, this prevent CDK to apply change to existing service Resource of type 'AWS::ECS::Service' with identifier 'eksutils' already exists.
      taskDefinition: task,
      platformVersion: FargatePlatformVersion.VERSION1_4,
      enableExecuteCommand: true,
    });

    //this._configureTaskRole(props, cluster, service, task);

    /**
     * create ALB
     */
    const alb = new ApplicationLoadBalancer(this, props.name + 'ALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'ecs-' + clusterProps.clusterName + '-' + props.name,
    });
    const r53DomainZone = this.node.tryGetContext('route53_domain_zone');
    const r53EksUtilsPrefix = this.node.tryGetContext('route53_eksutils_prefix')
      ? this.node.tryGetContext('route53_eksutils_prefix')
      : stack.stackName + '-eksutils';
    // Eksutils listener on 80
    const listener = alb.addListener(props.name + 'Listener', { port: 443 });
    const certificateArn = StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + r53DomainZone,
    }).stringValue;
    //const certificate = Certificate.fromCertificateArn(this, 'Cert', certificateArn);
    const certificate = ListenerCertificate.fromArn(certificateArn);

    const domainZone = HostedZone.fromLookup(this, props.name + 'Zone', { domainName: r53DomainZone });
    listener.addCertificates(props.name + 'cert', [certificate]);
    const record = new ARecord(this, props.name + 'AliasRecord', {
      zone: domainZone,
      recordName: r53EksUtilsPrefix + '.' + r53DomainZone,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(alb)),
    });
    record.domainName;
    new CfnOutput(this, props.name + 'URL', { value: 'https://' + record.domainName });

    listener.addTargets(props.name + 'Targets', {
      port: 8080,
      targets: [
        service.loadBalancerTarget({
          containerName: props.name,
          containerPort: 8080,
        }),
      ],
      healthCheck: {
        healthyThresholdCount: 2, // Min 2
        unhealthyThresholdCount: 10, // MAx 10
        timeout: Duration.seconds(120),
        interval: Duration.seconds(125),
        healthyHttpCodes: '200-499',
      },
      deregistrationDelay: Duration.seconds(120),
    });

    // allow all traffic from ALB to service
    service.connections.allowFrom(alb, Port.allTraffic());
    // allow connection between efs filesystem
    service.connections.allowFrom(fs, Port.tcp(2049));
    service.connections.allowTo(fs, Port.tcp(2049));

    // new CfnOutput(this, props.name + 'URL', {
    //   value: `http://${alb.loadBalancerDnsName}`,
    // });
    new CfnOutput(stack, 'EcsExecCommandEksUtils', {
      value: `ecs_exec_service ${cluster.clusterName} ${service.serviceName} ${task.defaultContainer?.containerName}`,
    });
  }

  // private _configureTaskRole(
  //   props: ServiceTaskProps,
  //   cluster: ICluster,
  //   service: FargateService,
  //   taskDefinition: TaskDefinition,
  // ) {
  //   const stack = Stack.of(this);

  //   // taskDefinition.addToTaskRolePolicy(
  //   //   new PolicyStatement({
  //   //     actions: [
  //   //       'ssmmessages:CreateControlChannel',
  //   //       'ssmmessages:CreateDataChannel',
  //   //       'ssmmessages:OpenControlChannel',
  //   //       'ssmmessages:OpenDataChannel',
  //   //     ],
  //   //     resources: ['*'],
  //   //   }),
  //   // );
  //   // taskDefinition.addToTaskRolePolicy(
  //   //   new PolicyStatement({
  //   //     effect: Effect.ALLOW,
  //   //     actions: ['logs:DescribeLogGroups'],
  //   //     resources: ['*'],
  //   //   }),
  //   // );
  //   // taskDefinition.addToTaskRolePolicy(
  //   //   new PolicyStatement({
  //   //     effect: Effect.ALLOW,
  //   //     actions: ['logs:CreateLogStream', 'logs:DescribeLogStreams', 'logs:PutLogEvents'],
  //   //     resources: [props.execLogGroup.logGroupArn],
  //   //   }),
  //   // );
  //   // taskDefinition.addToTaskRolePolicy(
  //   //   new PolicyStatement({
  //   //     effect: Effect.ALLOW,
  //   //     actions: ['s3:GetBucketLocation'],
  //   //     resources: ['*'],
  //   //   }),
  //   // );
  //   // taskDefinition.addToTaskRolePolicy(
  //   //   new PolicyStatement({
  //   //     effect: Effect.ALLOW,
  //   //     actions: ['s3:GetEncryptionConfiguration'],
  //   //     resources: [props.execBucket.bucketArn],
  //   //   }),
  //   // );
  //   // taskDefinition.addToTaskRolePolicy(
  //   //   new PolicyStatement({
  //   //     effect: Effect.ALLOW,
  //   //     actions: ['s3:PutObject'],
  //   //     resources: [props.execBucket.bucketArn],
  //   //   }),
  //   // );
  //   // taskDefinition.addToTaskRolePolicy(
  //   //   new PolicyStatement({
  //   //     effect: Effect.ALLOW,
  //   //     actions: ['kms:Decrypt'],
  //   //     resources: [props.kmsKey.keyArn],
  //   //   }),
  //   // );

  //   // we need ExecuteCommandConfiguration
  //   // const cfnCluster = cluster.node.defaultChild as CfnCluster;
  //   // cfnCluster.addPropertyOverride('Configuration.ExecuteCommandConfiguration', {
  //   //   KmsKeyId: props.kmsKey.keyId,
  //   //   LogConfiguration: {
  //   //     CloudWatchLogGroupName: props.execLogGroup.logGroupName,
  //   //     CloudWatchEncryptionEnabled: true,
  //   //     S3BucketName: props.execBucket.bucketName,
  //   //     S3KeyPrefix: 'exec-output',
  //   //   },
  //   //   Logging: 'OVERRIDE',
  //   // });
  //   // enable EnableExecuteCommand for the service
  //   // const cfnService = service.node.findChild('Service') as CfnService;
  //   // cfnService.addPropertyOverride('EnableExecuteCommand', true);

  //   new CfnOutput(stack, 'EcsExecCommand', {
  //     value: `ecs_exec_service ${cluster.clusterName} ${service.serviceName} ${taskDefinition.defaultContainer?.containerName}`,
  //   });
  // }

  private _createEfsFilesystem(): IFileSystem {
    return new FileSystem(this, 'efs', {
      vpc: this.vpc,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  /**
   * Create a basic web service on AWS Fargate
   */
  public createWebService(id: string, options: WebServiceOptions): NetworkLoadBalancedFargateService {
    // flask service
    const DEFAULT_SERVICE_IMAGE = 'public.ecr.aws/pahudnet/flask-docker-sample';

    const task = new FargateTaskDefinition(this, `task${id}`, {
      cpu: 256,
      memoryLimitMiB: 512,
    });

    task
      .addContainer(`container${id}`, {
        image: options.image ?? ContainerImage.fromRegistry(DEFAULT_SERVICE_IMAGE),
        environment: options.environment,
        logging: new AwsLogDriver({
          streamPrefix: id,
          logRetention: RetentionDays.ONE_DAY,
        }),
      })
      .addPortMappings({
        containerPort: options.port ?? 80,
      });

    const service = new NetworkLoadBalancedFargateService(this, `service${id}`, {
      cluster: this.cluster,
      taskDefinition: task,
      assignPublicIp: true,
    });

    // allow Fargate task behind NLB to accept all traffic
    service.service.connections.allowFromAnyIpv4(Port.tcp(80));
    service.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30');
    service.loadBalancer.setAttribute('load_balancing.cross_zone.enabled', 'true');
    return service;
  }
}

// function getOrCreateVpc(scope: Construct): IVpc {
//   // use an existing vpc or create a new one
//   return scope.node.tryGetContext('use_default_vpc') === '1'
//     ? Vpc.fromLookup(scope, 'Vpc', { isDefault: true })
//     : scope.node.tryGetContext('use_vpc_id')
//     ? Vpc.fromLookup(scope, 'Vpc', { vpcId: scope.node.tryGetContext('use_vpc_id') })
//     : new Vpc(scope, 'Vpc', { maxAzs: 3, natGateways: 1 });
// }
