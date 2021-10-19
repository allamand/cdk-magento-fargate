const { AwsCdkTypeScriptApp } = require('projen');
const project = new AwsCdkTypeScriptApp({
  cdkVersion: '1.124.0',
  defaultReleaseBranch: 'main',
  name: 'ecs-capacityproviders',

  cdkDependencies: [
    '@aws-cdk/aws-certificatemanager',
    '@aws-cdk/aws-ec2',
    '@aws-cdk/aws-ecr',
    '@aws-cdk/aws-ecs',
    '@aws-cdk/aws-ecs-patterns',
    '@aws-cdk/aws-route53',
    '@aws-cdk/aws-ssm',
    '@aws-cdk/aws-rds',
    '@aws-cdk/core',
    '@aws-cdk/aws-logs',
    '@aws-cdk/aws-efs',
    '@aws-cdk/aws-kms',
    '@aws-cdk/aws-s3',
    '@aws-cdk-containers/ecs-service-extensions',
    '@aws-cdk/aws-iam',
    '@aws-cdk/aws-elasticloadbalancingv2',
    '@aws-cdk/aws-servicediscovery',
    '@aws-cdk/aws-route53-targets',
  ],

  cdkTestDependencies: ['@aws-cdk/assert'],

  dependabot: false,
  //projenUpgradeSecret: 'YARN_UPGRADE_TOKEN',
  //autoApproveUpgrades: true,
  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['github-actions', 'github-actions[bot]', 'allamand'],
  },

  //releaseEveryCommit: true,
  //releaseToNpm: true,

  gitignore: ['cdk.out', 'cdk.context.json'],

  // cdkDependencies: undefined,  /* Which AWS CDK modules (those that start with "@aws-cdk/") this app uses. */
  // deps: [],                    /* Runtime dependencies of this module. */
  // description: undefined,      /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],                 /* Build dependencies for this module. */
  // packageName: undefined,      /* The "name" in package.json. */
  // release: undefined,          /* Add release management to this project. */
});
project.synth();
