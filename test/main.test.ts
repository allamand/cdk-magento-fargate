import '@aws-cdk/assert/jest';
import { App } from '@aws-cdk/core';
import { MagentoStack } from '../src/main';

test('For Mandatory Infra Constructs have been created', () => {
  const app = new App({
    context: {
      route53_domain_zone: 'magento.mydomain.com',
      magento_debug_task: 'yes',
    },
  });

  const stackName = process.env.CDK_STACK_NAME ? process.env.CDK_STACK_NAME : 'magento';
  const clusterName = stackName;

  const devEnv = {
    account: '1234567890',
    region: 'us-east-1',
  };

  const stack = new MagentoStack(app, stackName, {
    clusterName: clusterName,
    createCluster: true,
    env: devEnv,
  });
  // Check for Mandatory Resources
  expect(stack).toHaveResource('AWS::RDS::DBInstance');
  expect(stack).toHaveResource('AWS::RDS::DBCluster');
  expect(stack).toHaveResource('AWS::OpenSearchService::Domain');
  expect(stack).toHaveResource('AWS::ECS::Service');
  expect(stack).toHaveResource('AWS::ElasticLoadBalancingV2::LoadBalancer');
  
  // Expect for Resource with this Specs 
  
  expect(app.synth().getStackArtifact(stack.artifactId).template).toMatchSnapshot();
});