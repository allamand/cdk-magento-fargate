import { App } from '@aws-cdk/core';
import { MagentoStack } from './main';

const stackName = process.env.CDK_STACK_NAME ? process.env.CDK_STACK_NAME : 'magento';
const clusterName = stackName;

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();
new MagentoStack(app, stackName, {
  clusterName: clusterName,
  createCluster: true,
  description: 'MY Description',
  env: devEnv,
});

app.synth();
