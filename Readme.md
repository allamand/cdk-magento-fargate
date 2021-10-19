# ecs-capacityproviders demo

## Bootstrap project with projen

The goal of this project is to deploy ECS service with Autoscaling, and relying on a ECS cluster using Capacity Providers with an AutoScaling Group.

You can configure :
- DOMAIN_NAME - if you want to expose the service on a custom domain within route53, it will be https://<DOMAIN_NAME>.<DOMAIN_ZONE>
- DOMAIN_ZONE - the Route53 zone to use to expose the service.
- VPC_TAG_NAME - the name of an existing VPC to deploy in, or else it will create a new one
- CLUSTER_NAME - the name of the cluster to create (default DOMAIN_NAME)
- 
## Locally test


```bash
npx cdk synth
```

```bash
npx cdk deploy
```

ex to deploy with custom parameters:

This will create a new VPC:
```bash
export DOMAIN_NAME=test; export DOMAIN_ZONE=my.domain.com ; npx cdk deploy 
```

This will use the existing VPC
```bash
export DOMAIN_NAME=test; 
export DOMAIN_ZONE=my.domain.com ; 
export VPC_TAG_NAME=existing/VPC;
npx cdk deploy
```

## Known Issues

We can't delete the stack (`cdk destroy`) without priori deleting the ECS Capacity Provider

## The project is Bootstrap  with projen

```bash
npm install projen
```

how to init a project with projen:

```bash
$ git init
$ npx projen new awscdk-app-ts
```

This creates a `.projenrc.js` file

you can regenerate with

```bash
npx projen
```

```bash
pj build
```

Install dependencies
```bash
npx npm i
```

Add some packages:
```
npx npm install @aws-cdk/aws-certificatemanager 
```
## Locally test

```bash
npx cdk synth
```

```bash
npx cdk deploy
```