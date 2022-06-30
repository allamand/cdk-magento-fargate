const {awscdk} = require('projen');
const project = new awscdk.AwsCdkTypeScriptApp({
  authorName: 'Amazon Web Services',
  authorUrl: 'https://aws.amazon.com',
  authorOrganization: true,
  homepage: 'https://github.com/aws-samples/cdk-magento-fargate.git',
  copyrightPeriod: `2021-${new Date().getFullYear()}`,
  copyrightOwner: 'Amazon.com, Inc. or its affiliates. All Rights Reserved.',
  keywords: ['aws', 'constructs', 'cdk', 'ecs', 'magento'],

  cdkVersion: '2.20.0',
  defaultReleaseBranch: 'main',
  license: 'MIT-0',
  name: 'cdk-magento-fargate',
  repositoryUrl: 'https://github.com/aws-samples/cdk-magento-fargate.git',
  appEntrypoint: 'integ.ts',

  dependabot: false,

  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['github-actions', 'github-actions[bot]', 'allamand'],
  },

  context: {
    //vpc_tag_name: 'ecsworkshop-base/BaseVPC', // TAG Name of the VPC to create the cluster into (or 'default' or remove to create new one)
    enablePrivateLink: 'false', // this parameter seems to works only one
    createEFS: 'no', //CDK will create the EFS File System
    useEFS: 'no', //CDK will use the created file system in the ECS Task
    useFSX: 'yes',
    ec2Cluster: 'yes',
    ec2InstanceType: 'c5.9xlarge',
    rdsInstanceType: 'r6g.8xlarge',
    cacheInstanceType: 'r6g.8xlarge',

    //route53_domain_zone: 'ecs.demo3.allamand.com',

    magento_admin_task: 'yes',
    magento_admin_task_debug: 'no',
  },

  gitignore: ['cdk.out', 'cdk.context.json', '*.d.ts', '*.js', 'CMD', '.projenrc.js-*'],

  // cdkDependencies: undefined,  /* Which AWS CDK modules (those that start with "@aws-cdk/") this app uses. */
  // deps: [],                    /* Runtime dependencies of this module. */
  // description: undefined,      /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],                 /* Build dependencies for this module. */
  // packageName: undefined,      /* The "name" in package.json. */
  // release: undefined,          /* Add release management to this project. */
});

project.synth();
