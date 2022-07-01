const {awscdk} = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  authorName: 'Amazon Web Services',
  authorUrl: 'https://aws.amazon.com',
  authorOrganization: true,
  homepage: 'https://github.com/aws-samples/cdk-magento-fargate.git',
  copyrightPeriod: `2021-${new Date().getFullYear()}`,
  copyrightOwner: 'Amazon.com, Inc. or its affiliates. All Rights Reserved.',
  keywords: ['aws', 'constructs', 'cdk', 'ecs', 'magento'],

  cdkVersion: '2.29.1',
  defaultReleaseBranch: 'main',
  license: 'MIT-0',
  name: 'cdk-magento-fargate',
  repositoryUrl: 'https://github.com/aws-samples/cdk-magento-fargate.git',
  appEntrypoint: 'integ.ts',

  dependabot: true,

  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['github-actions', 'github-actions[bot]', 'allamand'],
  },

  context: {
    //vpc_tag_name: 'ecsworkshop-base/BaseVPC', // TAG Name of the VPC to create the cluster into (or 'default' or comment to create new one)
    enablePrivateLink: 'true', // this parameter seems to works only one

    createEFS: 'yes', //if yes CDK will create the EFS File System
    useEFS: 'yes', // if true, /bitnami/magento directory will be mapped to a new empty FSX volume.

    //useFSX: 'yes', // if yes, create en EC2 based cluster (required for FsX), if no create Fargate cluster
    ec2Cluster: 'no', // if yes, create en EC2 based cluster (required for FsX), if no create Fargate cluster

    // ec2InstanceType: 'c5.9xlarge',
    // rdsInstanceType: 'r6g.8xlarge',
    // cacheInstanceType: 'r6g.8xlarge',

    taskCpu: 1024,
    taskMem: 4096,
    phpMemoryLimit: '3G',
    magentoMinTasks: 10,
    magentoMaxTasks: 100,

    route53_domain_zone: 'sallaman.people.aws.dev',

    magento_admin_task: 'yes',
    magento_admin_task_debug: 'no',
  },

  gitignore: ['cdk.out', 'cdk.context.json', '*.d.ts', '*.js', 'CMD', '.projenrc.js-*', '.env*'],

  // cdkDependencies: undefined,  /* Which AWS CDK modules (those that start with "@aws-cdk/") this app uses. */
  // deps: [],                    /* Runtime dependencies of this module. */
  // description: undefined,      /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],                 /* Build dependencies for this module. */
  // packageName: undefined,      /* The "name" in package.json. */
  // release: undefined,          /* Add release management to this project. */
});

project.synth();
