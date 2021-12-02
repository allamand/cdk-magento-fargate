/* eslint-disable @typescript-eslint/member-ordering */

import { Certificate } from '@aws-cdk/aws-certificatemanager';
import { ISecurityGroup, IVpc } from '@aws-cdk/aws-ec2';
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
import { IFileSystem } from '@aws-cdk/aws-efs';
import { ApplicationLoadBalancer } from '@aws-cdk/aws-elasticloadbalancingv2';
import { Effect, PolicyStatement } from '@aws-cdk/aws-iam';
import { Key } from '@aws-cdk/aws-kms';
import { LogGroup } from '@aws-cdk/aws-logs';
import { Domain } from '@aws-cdk/aws-opensearchservice';
import { IDatabaseCluster } from '@aws-cdk/aws-rds';
import { ARecord, HostedZone, RecordTarget } from '@aws-cdk/aws-route53';
import { LoadBalancerTarget } from '@aws-cdk/aws-route53-targets';
import { Bucket } from '@aws-cdk/aws-s3';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { StringParameter } from '@aws-cdk/aws-ssm';
import { CfnOutput, Construct, Duration, Stack } from '@aws-cdk/core';

/**
 * construct properties for EksUtils
 */
export interface MagentoServiceProps {
  /**
   * Vpc for the Service
   * @default - create a new VPC or use existing one
   */
  readonly vpc: IVpc;
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
  readonly service!: FargateService;
  readonly hostName!: string;
  getService() {
    return this.service;
  }

  constructor(scope: Construct, id: string, props: MagentoServiceProps) {
    super(scope, id);

    const stack = Stack.of(this);

    /*
     ** If we provide var in context route53_domain_zone, then we want to uses this hostedzone to expose our app.
     ** else, we are only going to leverage default load balancer DNS name.
     */
    // Lookup pre-existing TLS certificate for our magento service:
    const r53DomainZone = this.node.tryGetContext('route53_domain_zone');
    // ? this.node.tryGetContext('route53_domain_zone')
    // : 'magento.mydomain.com';
    const r53MagentoPrefix = this.node.tryGetContext('route53_magento_prefix')
      ? this.node.tryGetContext('route53_magento_prefix')
      : stack.stackName;

    /**
     * create ALB
     */
    const alb = new ApplicationLoadBalancer(this, id + 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: 'ecs-' + props.cluster.clusterName,
    });

    var certificate = undefined;
    var domainZone = undefined;
    var listener = undefined;
    // If we define a route53 hosted zone, we setup also SSL and certificate
    if (!props.debug) {
      if (r53DomainZone != undefined) {
        const certificateArn = StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
          parameterName: 'CertificateArn-' + r53DomainZone,
        }).stringValue;
        certificate = Certificate.fromCertificateArn(this, 'ecsCert', certificateArn);
        domainZone = HostedZone.fromLookup(this, 'Zone', { domainName: r53DomainZone });
        this.hostName = r53MagentoPrefix + '.' + r53DomainZone;

        listener = alb.addListener(id + 'Listener', { port: 443 });

        listener.addCertificates(id + 'cert', [certificate]);
        new ARecord(this, id + 'AliasRecord', {
          zone: domainZone,
          recordName: r53MagentoPrefix + '.' + r53DomainZone,
          target: RecordTarget.fromAlias(new LoadBalancerTarget(alb)),
        });
      } else {
        //if no route53 we will run in http mode on default LB domain name
        listener = alb.addListener(id + 'Listener', { port: 80 });
        this.hostName = alb.loadBalancerDnsName;
      }
    }
    new CfnOutput(this, id + 'URL', { value: 'https://' + this.hostName });

    //TODO: Which combination is the best for Magento ?
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
      MAGENTO_USERNAME: magentoUser,
      MAGENTO_DEPLOY_STATIC_CONTENT: 'yes',
      MAGENTO_HOST: this!.hostName,
      MAGENTO_ENABLE_HTTPS: 'yes',
      MAGENTO_ENABLE_ADMIN_HTTPS: 'yes',
      MAGENTO_MODE: 'production', //TODO: var for this

      //TODO: add HTTP Cache

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

      PHP_MEMORY_LIMIT: '2G',
    };
    const magentoSecrets = {
      MAGENTO_PASSWORD: ecs.Secret.fromSecretsManager(props.magentoPassword),
      MAGENTO_DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(props.dbPassword),
      MAGENTO_ELASTICSEARCH_PASSWORD: ecs.Secret.fromSecretsManager(props.osPassword),
    };

    var containerDef: ContainerDefinitionOptions = {
      containerName: 'magento',
      image: ContainerImage.fromRegistry(props.magentoImage),
      command: props.debug == true ? ['tail', '-f', '/dev/null'] : undefined,
      logging: new AwsLogDriver({ streamPrefix: 'magento', mode: AwsLogDriverMode.NON_BLOCKING }),
      environment: magentoEnvs,
      secrets: magentoSecrets,
    };
    const container = taskDefinition.addContainer('magento', containerDef);

    container.addPortMappings({
      containerPort: 8080,
    });
    container.addMountPoints({
      readOnly: false,
      containerPath: '/bitnami/magento',
      sourceVolume: 'MagentoEfsVolume',
    });

    //container.addToExecutionPolicy(
    taskDefinition.addToExecutionRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: ['*'],
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
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

    //No Load Balancer for Debug Service
    this.service = new FargateService(this, 'Service' + id, {
      cluster,
      serviceName: id, // when specifying service name, this prevent CDK to apply change to existing service Resource of type 'AWS::ECS::Service' with identifier 'eksutils' already exists.
      taskDefinition: taskDefinition,
      desiredCount: 1,
      platformVersion: FargatePlatformVersion.VERSION1_4,
      securityGroups: [props.serviceSG],
      enableExecuteCommand: true,
    });

    new CfnOutput(stack, 'EcsExecCommand' + id, {
      value: `ecs_exec_service ${cluster.clusterName} ${this.service.serviceName} ${taskDefinition.defaultContainer?.containerName}`,
    });

    if (!props.debug) {
      const target = listener!.addTargets(id + 'Targets', {
        port: 8080,
        targets: [
          this.service.loadBalancerTarget({
            containerName: 'magento',
            containerPort: 8080,
          }),
        ],
        healthCheck: {
          healthyThresholdCount: 2, // Min 2
          unhealthyThresholdCount: 10, // MAx 10
          timeout: Duration.seconds(120),
          interval: Duration.seconds(125),
          healthyHttpCodes: '200-499',
          path: '/',
        },
        deregistrationDelay: Duration.seconds(120),
      });

      const scalableTarget = this.service.autoScaleTaskCount({
        minCapacity: 1,
        maxCapacity: 50,
      });

      scalableTarget.scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: 50,
      });

      scalableTarget.scaleOnRequestCount('RequestScaling', {
        requestsPerTarget: 10000,
        targetGroup: target,
      });

      //TODO : Scalable target on schedule
      //Invalid schedule expression. Details: Schedule expressions must have the following syntax: rate(<number>\s?(minutes?|hours?|days?)), cron(<cron_expression>) or at(yyyy-MM-dd'T'HH:mm:ss). (Service: AWSApplicationAutoScaling;

      // scalableTarget.scaleOnSchedule('DaytimeScaleDown', {
      //   schedule: Schedule.cron({ hour: '19', minute: '0' }),
      //   minCapacity: 1,
      // });

      // scalableTarget.scaleOnSchedule('EveningRushScaleUp', {
      //   schedule: Schedule.cron({ hour: '8', minute: '0' }),
      //   minCapacity: 10,
      // });
    }

    //new CfnOutput(this, 'magentoURL', { value: 'https://' + this.service.loadBalancer.loadBalancerDnsName });
    new CfnOutput(this, 'magentoURL', { value: 'https://' + this!.hostName });
  }
}
