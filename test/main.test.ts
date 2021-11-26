import '@aws-cdk/assert/jest';
import { App } from '@aws-cdk/core';
import { MagentoStack } from '../src/main';


test('Snapshot', () => {
  const app = new App({
    context: {
      route53_domain_zone: 'magento.mydomain.com',
      magento_debug_task: 'yes',
    },
  });

  const stackName = process.env.CDK_STACK_NAME ? process.env.CDK_STACK_NAME : 'magento';
  const clusterName = stackName;

  const devEnv = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  };

  const stack = new MagentoStack(app, stackName, {
    clusterName: clusterName,
    createCluster: true,
    env: devEnv,
  });

  expect(stack).not.toHaveResource('AWS::S3::Bucket');
  expect(app.synth().getStackArtifact(stack.artifactId).template).toMatchSnapshot();
});