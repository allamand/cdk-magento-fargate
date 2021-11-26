import { Certificate } from '@aws-cdk/aws-certificatemanager';
import { ISecurityGroup } from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import {
  AwsLogDriver,
  AwsLogDriverMode,
  ContainerDefinitionOptions,
  ContainerImage,
  FargatePlatformVersion,
  FargateService,
  FargateTaskDefinition,
  ICluster,
} from '@aws-cdk/aws-ecs';
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import { IFileSystem } from '@aws-cdk/aws-efs';
import { SslPolicy } from '@aws-cdk/aws-elasticloadbalancingv2';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { Domain } from '@aws-cdk/aws-opensearchservice';
import { IDatabaseCluster } from '@aws-cdk/aws-rds';
import { HostedZone } from '@aws-cdk/aws-route53';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { StringParameter } from '@aws-cdk/aws-ssm';
import { CfnOutput, Construct, Duration, Stack } from '@aws-cdk/core';

/**
 * construct properties for EksUtils
 */
export interface MagentoServiceProps {
  /**
   * Cluster ECS
   */
  readonly cluster: ICluster;

  /*
   * magentoPassword
   */
  readonly magentoPassword: secretsmanager.Secret;
  /**
   *  Magento docker image
   *
   */
  readonly magentoImage: string;

  /**
   * Efs FileSystem to uses for the service
   */
  readonly efsFileSystem: IFileSystem;

  /**
   * Database Cluster
   */
  readonly db: IDatabaseCluster;

  /**
   * Database User
   */
  readonly dbUser: string;

  /**
   * Database Name
   */
  readonly dbName: string;

  /**
   * Database Password
   */

  readonly dbPassword: secretsmanager.Secret;

  /**
   * OpenSearch Domain
   */
  readonly osDomain: Domain;

  /**
   * OpenSearch User
   */
  readonly osUser: string;

  /*
   * magento Opensearch Admin Password
   */
  readonly osPassword: secretsmanager.Secret;
  //readonly osPassword: string;

  /*
   * Service Security Group
   */
  readonly serviceSG: ISecurityGroup;

  /*
   ** Debug specify if we cxreate a service with empty command to not start magento process and allow ecs connect in it
   ** @default false (TODO: how to set default to false ??)
   */
  readonly debug?: Boolean;
}

/*
 ** //https://docs.aws.amazon.com/cdk/api/latest/docs/aws-ecs-readme.html
 */
export class MagentoService extends Construct {
  readonly service!: ApplicationLoadBalancedFargateService;
  readonly hostName: string;
  getService() {
    return this.service;
  }

  constructor(scope: Construct, id: string, props: MagentoServiceProps) {
    super(scope, id);

    const stack = Stack.of(this);

    // Lookup pre-existing TLS certificate for our magento service:
    const r53DomainZone = this.node.tryGetContext('route53_domain_zone');
    const r53MagentoPrefix = this.node.tryGetContext('route53_magento_prefix')
      ? this.node.tryGetContext('route53_magento_prefix')
      : stack.stackName;

    const certificateArn = StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + r53DomainZone,
    }).stringValue;
    const certificate = Certificate.fromCertificateArn(this, 'ecsCert', certificateArn);
    const domainZone = HostedZone.fromLookup(this, 'Zone', { domainName: r53DomainZone });
    this.hostName = r53MagentoPrefix + '.' + r53DomainZone;

    const taskDefinition = new FargateTaskDefinition(this, 'TaskDef' + id, {
      cpu: 4096,
      memoryLimitMiB: 30720,
    });

    taskDefinition.addVolume({
      name: 'MagentoEfsVolume',
      efsVolumeConfiguration: {
        fileSystemId: props.efsFileSystem.fileSystemId,
        transitEncryption: 'ENABLED',
        // authorizationConfig: {
        //   accessPointId: fileSystemAccessPoint.accessPointId,
        // },
      },
    });

    const magentoUser = this.node.tryGetContext('magento_user') ? this.node.tryGetContext('magento_user') : 'magento';

    const magentoEnvs: { [key: string]: string } = {
      BITNAMI_DEBUG: 'true',
      MAGENTO_USER: magentoUser,
      MAGENTO_DEPLOY_STATIC_CONTENT: 'yes',
      MAGENTO_HOST: this.hostName,
      MAGENTO_DATABASE_HOST: props.db.clusterEndpoint.hostname,
      MAGENTO_DATABASE_PORT_NUMBER: '3306',
      MAGENTO_DATABASE_USER: props.dbUser,
      MAGENTO_DATABASE_NAME: props.dbName,

      // // MAGENTO_CLIENT_DATABASE_HOST: db.clusterEndpoint.hostname,
      // // MAGENTO_CLIENT_DATABASE_PORT_NUMBER: '3306',
      // // MAGENTO_CLIENT_DATABASE_USER: DB_USER,
      // // MAGENTO_CLIENT_DATABASE_PASSWORD: DB_PASSWORD,
      // // MAGENTO_CLIENT_DATABASE_NAME: DB_NAME,

      ELASTICSEARCH_HOST: props.osDomain.domainEndpoint,
      ELASTICSEARCH_PORT_NUMBER: '443',
      MAGENTO_ELASTICSEARCH_USE_HTTPS: 'yes',
      MAGENTO_ELASTICSEARCH_ENABLE_AUTH: 'yes',
      MAGENTO_ELASTICSEARCH_USER: props.osUser,

      MAGENTO_ELASTICSEARCH_PASSWORD: props.osDomain.masterUserPassword!.toString(),
      //MAGENTO_ELASTICSEARCH_PASSWORD: props.osPassword,

      PHP_MEMORY_LIMIT: '8G',
    };
    const magentoSecrets = {
      MAGENTO_PASSWORD: ecs.Secret.fromSecretsManager(props.magentoPassword),
      MAGENTO_DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(props.dbPassword),
      //MAGENTO_ELASTICSEARCH_PASSWORD: ecs.Secret.fromSecretsManager(props.osPassword),
    };

    var containerDef: ContainerDefinitionOptions = {
      containerName: 'magento',
      image: ContainerImage.fromRegistry('public.ecr.aws/seb-demo/magento:elasticsearch-https-3'),
      //image: ContainerImage.fromRegistry('public.ecr.aws/seb-demo/magento:chown-1'),
      //image: ContainerImage.fromRegistry('docker.io/bitnami/magento:2'),
      //image: ContainerImage.fromRegistry('public.ecr.aws/seb-demo/eksutils'),
      //debug
      command: props.debug == true ? ['tail', '-f', '/dev/null'] : undefined,
      logging: new AwsLogDriver({ streamPrefix: 'magento', mode: AwsLogDriverMode.NON_BLOCKING }),
      environment: magentoEnvs,
      secrets: magentoSecrets,
      // memoryReservationMiB: 30720,
      // cpu: 4096,
    };
    const container = taskDefinition.addContainer('magento' + id, containerDef);

    container.addPortMappings({
      containerPort: 8080,
    });
    container.addMountPoints({
      readOnly: false,
      containerPath: '/bitnami/magento',
      sourceVolume: 'MagentoEfsVolume',
    });

    container.addToExecutionPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: ['*'],
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          // 'logs:CreateLogStream', // they are done automatically
          // 'logs:PutLogEvents',
        ],
      }),
    );

    taskDefinition.addToExecutionRolePolicy(
      new PolicyStatement({
        actions: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'],
        resources: [
          stack.formatArn({
            service: 'elasticfilesystem',
            resource: 'file-system',
            sep: '/',
            resourceName: props.efsFileSystem.fileSystemId,
          }),
        ],
      }),
    );

    /*
     * Add metrics sidecar
     * TODO: add metrics sidecar
     */
    //  taskDefinition.addContainer('Sidecar', {
    //    image: ecs.ContainerImage.fromRegistry('example/metrics-sidecar'),
    //  });

    /*
     * Create service
     */
    var cluster = props.cluster;
    if (!props.debug) {
      this.service = new ApplicationLoadBalancedFargateService(this, 'magentoService' + id, {
        cluster,
        serviceName: id,
        taskDefinition,
        desiredCount: 1,
        // deploymentController: {
        //   type: ecs.DeploymentControllerType.CODE_DEPLOY,
        // },
        //circuitBreaker: { rollback: true },

        // cloudMapOptions: {
        //   // Create A records - useful for AWSVPC network mode.
        //   dnsRecordType: DnsRecordType.A,
        // },
        //taskSubnets: ,
        securityGroups: [props.serviceSG],
        platformVersion: FargatePlatformVersion.VERSION1_4,
        // capacityProviderStrategies: [
        //   {
        //     capacityProvider: 'FARGATE_SPOT',
        //     weight: 2,
        //   },
        //   {
        //     capacityProvider: 'FARGATE',
        //     weight: 1,
        //     base: 1,
        //   },
        // ],
        maxHealthyPercent: 200,
        minHealthyPercent: 50,

        enableECSManagedTags: true,

        certificate: certificate,
        sslPolicy: SslPolicy.RECOMMENDED,
        domainName: this.hostName,
        domainZone: domainZone,
        redirectHTTP: true,

        healthCheckGracePeriod: Duration.minutes(60),
      });
      //enable execute https://github.com/aws/aws-cdk/issues/15197
      const cfnService = this.service.service.node.defaultChild as ecs.CfnService;
      cfnService.enableExecuteCommand = true;

      this.service.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30');
      this.service.targetGroup.configureHealthCheck({
        interval: Duration.seconds(60),
        healthyHttpCodes: '200,302',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10,
        timeout: Duration.seconds(50),
        path: '/',
      });

      //TODO: reactivate autoscaling when done

      //  const scalableTarget = this.service.service.autoScaleTaskCount({
      //    minCapacity: 5,
      //    maxCapacity: 20,
      //  });

      //  scalableTarget.scaleOnCpuUtilization('CpuScaling', {
      //    targetUtilizationPercent: 50,
      //  });

      //  scalableTarget.scaleOnRequestCount('RequestScaling', {
      //    requestsPerTarget: 10000,
      //    targetGroup: this.service.targetGroup,
      //  });

      // scalableTarget.scaleOnSchedule('DaytimeScaleDown', {
      //   schedule: Schedule.cron({ hour: '8', minute: '0' }),
      //   minCapacity: 1,
      // });

      // scalableTarget.scaleOnSchedule('EveningRushScaleUp', {
      //   schedule: appscaling.Schedule.cron({ hour: '20', minute: '0' }),
      //   minCapacity: 10,
      // });

      //new CfnOutput(this, 'magentoURL', { value: 'https://' + this.service.loadBalancer.loadBalancerDnsName });
      new CfnOutput(this, 'magentoURL', { value: 'https://' + this.hostName });

      new CfnOutput(stack, 'EcsExecCommand' + id, {
        value: `ecs_exec_service ${cluster.clusterName} ${this.service.service.serviceName} ${taskDefinition.defaultContainer?.containerName}`,
      });
    } else {
      //props.debug==true
      //No Load Balancer for Debug Service
      const debugService = new FargateService(this, 'Service' + id, {
        cluster,
        serviceName: id, // when specifying service name, this prevent CDK to apply change to existing service Resource of type 'AWS::ECS::Service' with identifier 'eksutils' already exists.
        taskDefinition: taskDefinition,
        desiredCount: 1,
        platformVersion: FargatePlatformVersion.VERSION1_4,
        securityGroups: [props.serviceSG],
        enableExecuteCommand: true,
      });

      new CfnOutput(stack, 'EcsExecCommand' + id, {
        value: `ecs_exec_service ${cluster.clusterName} ${debugService.serviceName} ${taskDefinition.defaultContainer?.containerName}`,
      });
    }
  }
}
