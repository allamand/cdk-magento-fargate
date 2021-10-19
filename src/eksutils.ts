import { IVpc, Port } from '@aws-cdk/aws-ec2';
import {
  AwsLogDriver,
  ContainerImage,
  FargateTaskDefinition,
  ICluster,
  RepositoryImage,
  Cluster,
  FargateService,
  FargatePlatformVersion,
  CfnService,
  CfnCluster,
  TaskDefinition,
} from '@aws-cdk/aws-ecs';
import { NetworkLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import { IFileSystem, FileSystem } from '@aws-cdk/aws-efs';
import { ApplicationListener, ApplicationLoadBalancer } from '@aws-cdk/aws-elasticloadbalancingv2';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { Key } from '@aws-cdk/aws-kms';
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs';
import { Bucket } from '@aws-cdk/aws-s3';
import { CfnOutput, Construct, Duration, RemovalPolicy, Stack } from '@aws-cdk/core';

const DEFAULTS = {
  eksutilsContainer: 'public.ecr.aws/seb-demo/eksutils',
};

/**
 * construct properties for Apisix
 */
export interface EksUtilsTaskProps {
  /**
   * Vpc for the APISIX
   * @default - create a new VPC or use existing one
   */
  readonly vpc: IVpc;
  /**
   * Amazon ECS cluster
   * @default - create a new cluster
   */
  readonly cluster?: ICluster;
  /**
   * Amazon EFS filesystem for etcd data persistence
   * @default - ceate a new filesystem
   */
  readonly efsFilesystem?: IFileSystem;
  /**
   * container for APISIX API service
   * @default - public.ecr.aws/d7p2r8s3/apisix
   */
  readonly eksutilsContainer?: ContainerImage;
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
  readonly cluster: ICluster;
  readonly envVar: { [key: string]: string };
  constructor(scope: Construct, id: string, props: EksUtilsTaskProps) {
    super(scope, id);

    const stack = Stack.of(this);
    const vpc = props.vpc;
    //const vpc = props.vpc ?? getOrCreateVpc(this);
    this.vpc = vpc!;
    const cluster = props.cluster ?? new Cluster(this, 'Cluster', { vpc });
    this.cluster = cluster;

    // const requiredContextVariables = [
    //   'ADMIN_KEY_ADMIN',
    //   'ADMIN_KEY_VIEWER',
    //   'DASHBOARD_ADMIN_PASSWORD',
    //   'DASHBOARD_USER_PASSWORD',
    // ];
    //    requiredContextVariables.map((v) => throwIfNotAvailable(this, v));

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

    const taskDefinition = new FargateTaskDefinition(this, 'TaskEksutils', {
      memoryLimitMiB: 512,
      cpu: 256,
    });
    const eksutils = taskDefinition.addContainer('eksutils', {
      image: ContainerImage.fromRegistry(DEFAULTS.eksutilsContainer),
      logging: new AwsLogDriver({
        streamPrefix: '/ecs/eksutils/',
        logRetention: RetentionDays.ONE_DAY,
      }),
      environment: {
        ADMIN_KEY_ADMIN: this.envVar.ADMIN_KEY_ADMIN,
        ADMIN_KEY_VIEWER: this.envVar.ADMIN_KEY_VIEWER,
      },
    });
    eksutils.addPortMappings({
      containerPort: 8080,
    });

    taskDefinition.addVolume({
      name: 'efs',
      efsVolumeConfiguration: {
        fileSystemId: fs.fileSystemId,
      },
    });
    eksutils.addMountPoints({
      containerPath: '/efs_data',
      sourceVolume: 'efs',
      readOnly: false,
    });
    //    eksutils.addContainerDependencies({
    //   container: etcdContainer,
    //   condition: ecs.ContainerDependencyCondition.START,
    // });

    taskDefinition.addToExecutionRolePolicy(
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
      })
    );

    /*
** we shoudls also used
    const svc = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'NginxService', {
      taskDefinition: task,
      cluster,
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
    });
    */
    const eksutilsService = new FargateService(this, 'EksUtilsService', {
      cluster,
      taskDefinition,
      platformVersion: FargatePlatformVersion.VERSION1_4,
    });

    this._configureTaskRole(cluster, eksutilsService, taskDefinition);

    /**
     * create ALB
     */
    const alb = new ApplicationLoadBalancer(this, 'eksutilsALB', { vpc, internetFacing: true });

    // Eksutils listener on 80
    const eksutilsListener = new ApplicationListener(this, 'EksUtilsListener', {
      loadBalancer: alb,
      //defaultTargetGroups: [service.tar],
      port: 80,
    });

    eksutilsListener.addTargets('eksUtilsTargets', {
      port: 80,
      targets: [
        eksutilsService.loadBalancerTarget({
          containerName: 'eksutils',
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
    eksutilsService.connections.allowFrom(alb, Port.allTraffic());
    // allow connection between efs filesystem
    eksutilsService.connections.allowFrom(fs, Port.tcp(2049));
    eksutilsService.connections.allowTo(fs, Port.tcp(2049));

    new CfnOutput(this, 'eksUtilsURL', {
      value: `http://${alb.loadBalancerDnsName}`,
    });
  }

  private _configureTaskRole(cluster: ICluster, eksutilsService: FargateService, taskDefinition: TaskDefinition) {
    const stack = Stack.of(this);

    // create kms key
    const kmsKey = new Key(this, 'KmsKey');
    // create log group
    const logGroup = new LogGroup(this, 'LogGroup');
    // ecs exec bucket
    const execBucket = new Bucket(this, 'EcsExecBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    taskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        actions: [
          'ssmmessages:CreateControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:OpenDataChannel',
        ],
        resources: ['*'],
      })
    );
    taskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['logs:DescribeLogGroups'],
        resources: ['*'],
      })
    );
    taskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['logs:CreateLogStream', 'logs:DescribeLogStreams', 'logs:PutLogEvents'],
        resources: [logGroup.logGroupArn],
      })
    );
    taskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetBucketLocation'],
        resources: ['*'],
      })
    );
    taskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetEncryptionConfiguration'],
        resources: [execBucket.bucketArn],
      })
    );
    taskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:PutObject'],
        resources: [execBucket.bucketArn],
      })
    );
    taskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [kmsKey.keyArn],
      })
    );

    // we need ExecuteCommandConfiguration
    const cfnCluster = cluster.node.defaultChild as CfnCluster;
    cfnCluster.addPropertyOverride('Configuration.ExecuteCommandConfiguration', {
      KmsKeyId: kmsKey.keyId,
      LogConfiguration: {
        CloudWatchLogGroupName: logGroup.logGroupName,
        CloudWatchEncryptionEnabled: true,
        S3BucketName: execBucket.bucketName,
        S3KeyPrefix: 'exec-output',
      },
      Logging: 'OVERRIDE',
    });
    // enable EnableExecuteCommand for the service
    const cfnService = eksutilsService.node.findChild('Service') as CfnService;
    cfnService.addPropertyOverride('EnableExecuteCommand', true);

    new CfnOutput(stack, 'EcsExecBucket', { value: execBucket.bucketName });
    new CfnOutput(stack, 'EcsExecCommand', {
      value: `ecs_exec_service ${cluster.clusterName} ${eksutilsService.serviceName} ${taskDefinition.defaultContainer?.containerName}`,
    });
  }

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

// function isContextAvailable(scope: Construct, key: string) {
//   return Stack.of(scope).node.tryGetContext(key);
// }
/**
 * Throws if the context is not available
 */
// function throwIfNotAvailable(scope: Construct, key: string) {
//   if (!isContextAvailable(scope, key)) {
//     throw new Error(`${key} is required in the context variable`);
//   }
// }
