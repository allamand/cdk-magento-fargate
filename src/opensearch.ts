// import * as ec2 from '@aws-cdk/aws-ec2';
// import { IVpc } from '@aws-cdk/aws-ec2';
// import { PropagatedTagSource } from '@aws-cdk/aws-ecs';
// import { Credentials, DatabaseCluster, DatabaseClusterEngine } from '@aws-cdk/aws-rds';
// import { Construct, RemovalPolicy, SecretValue } from '@aws-cdk/core';

// export interface MagentoOpensearchProps {
//   readonly vpc: IVpc;
// }

// export declare class Cluster extends Resource implements ICluster {
//       /**
//      * Manage the allowed network connections for the cluster with Security Groups.
//      *
//      * @stability stable
//      */
//     readonly connections: ec2.Connections;
// }

// export class MagentoOpensearch extends Construct {
//   constructor(scope: Construct, id: string, props: MagentoOpensearchProps) {
//     super(scope, id);


//     var DB_HOST = null;
//     var HTTP_HOST = null;
//     const DB_NAME = 'wordpress';
//     const DB_USER = 'wordpressuser';
//     const BASE_PATH = '/mnt/efs';
//     const ACCESSPOINT_PATH = '/wordpress';
//     const WORDPRESS_PATH = '/mnt/efs';
//     const KEY_NAME = this.node.tryGetContext('keyName');
//     const DOMAIN_NAME = this.node.tryGetContext('domainName');
//     const DB_PASSWORD = this.node.tryGetContext('dbPassword');
//     /**
//      * create security group in VPC
//      */
//     // NFS security group which used for ec2 to copy file
//     const sgNFSSG = new ec2.SecurityGroup(this, 'NFSAllowAllSG', {
//       vpc: props.vpc,
//       description: 'allow 2049 inbound for ec2',
//       allowAllOutbound: true,
//     });
//     sgNFSSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(2049), 'allow 2049 inbound from ec2');

//     //ALB security group which allow 80 and 443
//     const albSG = new ec2.SecurityGroup(this, 'albSG', {
//       vpc: props.vpc,
//       description: 'allow 80 and 443',
//       allowAllOutbound: true,
//     });
//     albSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'allow 80 inbound');
//     albSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'allow 443 inbound');

//     //EC2 security group which allow port 22
//     const ec2SG = new ec2.SecurityGroup(this, 'ec2SG', {
//       vpc: props.vpc,
//       description: 'allow 22 inbound for ec2',
//       allowAllOutbound: true,
//     });
//     ec2SG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'allow 22 inbound from ec2');

//     // RDS security group which allow port 3306
//     const rdsSG = new ec2.SecurityGroup(this, 'wordpressRdsSecurityGroup', {
//       vpc: props.vpc,
//       description: 'allow 3306 inbound',
//       allowAllOutbound: true,
//     });
//     rdsSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3306), 'allow 3306 inbound from lambda');


//     const secret = SecretValue.plainText(DB_PASSWORD);
//     const auroraServerlessCluster = new DatabaseCluster(this, 'ServerlessWordpressAuroraCluster', {
//       engine: DatabaseClusterEngine.AURORA_MYSQL,
//       credentials: Credentials.fromPassword(DB_USER, secret),
//       removalPolicy: RemovalPolicy.DESTROY,
//       instanceProps: {
//         vpc: props.vpc,
//         securityGroups: [rdsSG],
//       },
//       defaultDatabaseName: DB_NAME,
//     });

//     /***
//      *  set the DB_HOST and HTTP_HOST which will used in the lambda environment
//      */
//     DB_HOST = auroraServerlessCluster.clusterEndpoint.hostname;


//   }
// }
