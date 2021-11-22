const { AwsCdkTypeScriptApp } = require('projen');
const project = new AwsCdkTypeScriptApp({
  cdkVersion: '1.132.0',
  defaultReleaseBranch: 'main',
  name: 'cdk-magento-fargate',

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
    '@aws-cdk/aws-opensearchservice',
    '@aws-cdk-containers/ecs-service-extensions',
    '@aws-cdk/aws-iam',
    '@aws-cdk/aws-elasticloadbalancingv2',
    '@aws-cdk/aws-servicediscovery',
    '@aws-cdk/aws-route53-targets',
    '@aws-cdk/aws-secretsmanager',
  ],

  cdkTestDependencies: ['@aws-cdk/assert'],

  dependabot: false,
  //projenUpgradeSecret: 'YARN_UPGRADE_TOKEN',
  //autoApproveUpgrades: true,
  autoApproveOptions: {
    secret: 'GITHUB_TOKEN',
    allowedUsernames: ['github-actions', 'github-actions[bot]', 'allamand'],
  },

  context: {
    vpc_tag_name: 'ecsworkshop-base/BaseVPC', // TAG Name of the VPC to create the cluster into (or 'default' or remove to create new one)
    es_domain: 'magento-cdk2',
    es_key_nme: 'magentokey',
    es_domain_name: 'magento2',
    es_master_user_name: 'magento-es',
    es_master_user_password: 'P@sswordPlay78', // The master user password must contain at least one uppercase letter, one lowercase letter, one number, and one special character
    db_name: 'magento2',
    db_user: 'magentodbuser',
    db_password: 'MySuperPassword', // Only printable ASCII characters besides '/', '@', '"', ' ' may be used
    route53_domain_zone: 'ecs.demo3.allamand.com',
    route53_magento_prefix: 'magento2',
    route53_eksutils_prefix: 'eksutils2',
    magento_user: 'user1',
    magento_password: 'magento_password',
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
