import '@aws-cdk/assert/jest';
import { App } from '@aws-cdk/core';
import { MagentoStack } from '../src/main';

test('For Mandatory Infra Constructs have been created', () => {
  const app = new App({
    context: {
      route53_domain_zone: 'magento.mydomain.com',
      magento_admin_task: 'yes',
      useEFS: true,
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

  //expect(stack).toHaveResource('AWS::EFS::FileSystem');
  expect(stack).toHaveResource('AWS::EFS::MountTarget');
  expect(stack).toHaveResource('AWS::EFS::AccessPoint');

  expect(stack).toHaveResource('AWS::ECS::Service', {
    ServiceName: 'MagentoServiceAdmin',
  });
  // 'MagentoServiceAdminServiceMagentoServiceAdminService2DF18265');

  // Expect for Resource with this Specs

  expect(app.synth().getStackArtifact(stack.artifactId).template).toMatchSnapshot();
});

test('No Admin', () => {
  const app = new App({
    context: {
      route53_domain_zone: 'magento.mydomain.com',
      magento_admin_task: 'no',
      //useEFS: false, // We don't use EFS for this test
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

  expect(stack).not.toHaveResource('AWS::ECS::Service', {
    ServiceName: 'MagentoServiceAdmin',
  });

});
