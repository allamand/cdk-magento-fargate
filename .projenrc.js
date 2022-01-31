const { AwsCdkTypeScriptApp } = require('projen');
const project = new AwsCdkTypeScriptApp({
  authorName: 'Amazon Web Services',
  authorUrl: 'https://aws.amazon.com',
  authorOrganization: true,
  homepage: 'https://github.com/aws-samples/cdk-magento-fargate.git',
  copyrightPeriod: `2021-${new Date().getFullYear()}`,
  copyrightOwner: 'Amazon.com, Inc. or its affiliates. All Rights Reserved.',
  keywords: ['aws', 'constructs', 'cdk', 'ecs', 'magento'],

  cdkVersion: '1.137.0',
  defaultReleaseBranch: 'main',
  license: 'MIT-0',
  name: 'cdk-magento-fargate',
  repositoryUrl: 'https://github.com/aws-samples/cdk-magento-fargate.git',
  appEntrypoint: 'integ.ts',

  cdkDependencies: [
    '@aws-cdk/aws-certificatemanager',
    '@aws-cdk/aws-ec2',
    '@aws-cdk/aws-ecr',
    '@aws-cdk/aws-ecs',
    '@aws-cdk/aws-ecs-patterns',
    '@aws-cdk/aws-autoscaling',
    '@aws-cdk/aws-route53',
    '@aws-cdk/aws-ssm',
    '@aws-cdk/aws-rds',
    '@aws-cdk/core',
    '@aws-cdk/aws-logs',
    '@aws-cdk/aws-efs',
    '@aws-cdk/aws-kms',
    '@aws-cdk/aws-s3',
    '@aws-cdk/aws-opensearchservice',
    '@aws-cdk-containers/ecs-service-extensions',
    '@aws-cdk/aws-iam',
    '@aws-cdk/aws-elasticloadbalancingv2',
    '@aws-cdk/aws-servicediscovery',
    '@aws-cdk/aws-route53-targets',
    '@aws-cdk/aws-secretsmanager',
    '@aws-cdk/aws-elasticache',
    '@aws-cdk/cx-api',
  ],

  cdkTestDependencies: ['@aws-cdk/assert'],

  dependabot: false,

  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['github-actions', 'github-actions[bot]', 'allamand'],
  },

  context: {
    //vpc_tag_name: 'ecsworkshop-base/BaseVPC', // TAG Name of the VPC to create the cluster into (or 'default' or remove to create new one)
    enablePrivateLink: 'false', // this parameter seems to works only one
    createEFS: 'yes', //CDK will create the EFS File System
    useEFS: 'no', //CDK will use the created file system in the ECS Task

    //route53_domain_zone: 'ecs.demo3.allamand.com',

    //os_domain_endpoint: 'search-magento-zwa5v3x4br3kgn4y5e5nu6hv7q.eu-west-1.es.amazonaws.com',

    magento_admin_task: 'yes',
    magento_admin_task_debug: 'yes',
  },

  gitignore: ['cdk.out', 'cdk.context.json', '*.d.ts', '*.js', 'CMD'],

  // cdkDependencies: undefined,  /* Which AWS CDK modules (those that start with "@aws-cdk/") this app uses. */
  // deps: [],                    /* Runtime dependencies of this module. */
  // description: undefined,      /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],                 /* Build dependencies for this module. */
  // packageName: undefined,      /* The "name" in package.json. */
  // release: undefined,          /* Add release management to this project. */
});

project.synth();
