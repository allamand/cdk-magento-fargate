# Configuring your Magento Stack deployment

We rely on CDK parameters to configure the behaviour of our Infrastructure deployment.

Configuration example


```bash
  context: {
    //vpc_tag_name: 'ecsworkshop-base/BaseVPC', // TAG Name of the VPC to create the cluster into (or 'default' or comment to create new one)
    //enablePrivateLink: 'false', // enable privatelink for cloudWatch, SecretManager and EFS

    //Do you want to back data on share FilsSystem ?
    //Using EFS
    createEFS: 'no', //if yes CDK will create the EFS File System
    //os_domain_endpoint: 'search-magento-zwa5v3x4br3kgn4y5e5nu6hv7q.eu-west-1.es.amazonaws.com', // with CreateEFS=false, ou can Use Existing OS domain
    useEFS: 'no', // if yes, /bitnami/magento directory will be mapped to a new empty EFS volume.

    //or using FSX (recommended but need EC2 insteqd of Fargate)?
    useFSX: 'yes', // if true, /bitnami/magento directory will be mapped to a new empty FSX volume.

    ec2Cluster: 'yes', // if yes, create en EC2 based cluster (required for FsX), if no create Fargate cluster

    //you can specify instance types for EC2, RDS and Elasticache
    ec2InstanceType: 'c5.9xlarge',
    rdsInstanceType: 'r6g.8xlarge',
    cacheInstanceType: 'r6g.8xlarge',


    //os_domain: 'magento-cdk', // default to $CDK_STACK_NAME
    //os_master_user_name: 'magento-master-os',

    //db_name: 'magento', // default to env $CDK_STACK_NAME
    //db_user: 'magentodbuser',

    route53_domain_zone: 'your-hosted-zone.route53.com', //**VERY IMPORTANT** it willnot work without a valid route53 hosted zone for https

    //route53_magento_prefix: 'magento', // default to $CDK_STACK_NAME
    //route53_eksutils_prefix: 'eksutils', // default to $CDK_STACK_NAME-eksutils

    //magento_user: 'user1',

    //magento_admin_task_debug: 'no', // if yes put the admin task in "do nothing" so that you can manually connect and setup manually
  }
```

You can find here the full list of parameters

- **vpc_tag_name** : You can specify a tag name to use existing VPC, or ommit this parameter to create new VPC from CDK
- **enablePrivateLink** if true, enable VPC service endpoints for Cloudwatch, EFS, SecretManager. (@default: no)
- **createEFS** yes/no. if yes, create an EFS volume (@default: no)
- **useEFS** yes/no. if yes, map /bitnami/magento directory to the EFS created file system (@default: no)
- **useFSX** yes/no. if yes, create an FsX File System and map /bitnami/magento directory to the FSX created file system (@default: no)

  > useFSX and useEFS are mutual exclusive.

- **ec2Cluster**: yes/no. if yes, create an EC2 base cluster with Autoscaling group and Capacity Providers (@default: no = Fargate Cluster)

OpenSearch cluster parameters (password is generated by CDK and stored in SecretManager with name "$CDK_STACK_NAME-magento-opensearch-admin-password"):

- **os_domain_endpoint**: (OPTIONAL) If you have existing OpenSearch server you want to reuse, else create new OpenSearch domain.
- **os_domain** : the name of the OpenSearch Cluster that the cdk stack will create for you (@default: <stack_name>)
- **os_master_user_name**: the name for the master
- TODO: make rise of os_master_user_password

RDS Database (password is generated by CDK and stored in SecretManager with name "$CDK_STACK_NAME-magento"):

- **db_name**: the name of the db to create (@default: $CDK_STACK_NAME)
- **db_user**: the name of the db user (@default: magentouser)

ECS Cluster

- **route53_domain_zone** (MANDATORY) needs to specify the Route53 zone you want to use to deploy your services
- **route53_magento_prefix**: prefix to uses for exposing Magento service (@default: $CDK_STACK_NAME)
- **route53_eksutils_prefix**: prefix to uses for exposing the Eksutils service (@default: $CDK_STACK_NAME-eksutils )

> **You need to have prior to this created a wildcard certificate for your route53 zone in Certificate Manager and store this arn in Parameter store with key `CertificateArn-<route53_domain_zone>`**

Magento (password is generated by CDK and stored in SecretManager with name "<stackname>-magento-database-password"):)

- **magento_user**: magento user (@default: magento)
- **magento_admin_task**: yes/no - start admin magento service used to bootstrap magento with with `MAGENTO_DEPLOY_STATIC_CONTENT=yes`, `MAGENTO_SKIP_REINDEX=no`, `MAGENTO_SKIP_BOOTSTRAP=no` (@default yes)
- **magento_admin_task_debug**: yes/no - start admin magento service with just bash (not running magento instance) for debugging or executing scripts (@default no)

Instances Sizes
- **ec2InstanceType** size of the EC2 instances used by ECS (@default c5.xlarge)
- **rdsInstanceType** size of the EC2 instances used by RDS (@default r6g.large)
- **cacheInstanceType** size of the EC2 instances used by ElastiCache (@default r6g.large )

Tasks Sizes
- **taskCpu** size of the ECS Task Cpu (@default 2048)
- **taskMem** size of the ECS Task Memory (@default 8192)
- **phpMemoryLimit** limit of PHP memory allowed in magento, should be lower than taskMem (@default '7G')

Tasks Autoscaling

- **magentoMinTasks** minimum number of magento tasks (@default 1)
- **magentoMaxTasks** maximum number of magento tasks (@default 30)
- **targetCpuScaling** Cpu thresold in percentage of CPU usage for autoscaling (@default 60)
- **targetMemScaling** Cpu thresold in percentage of Memory usage for autoscaling (@default 60)