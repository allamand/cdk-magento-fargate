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

1. We can't delete the stack (`cdk destroy`) without priori deleting the ECS Capacity Provider

2. if you want to delete and re-create the same stack you need first to manually delete some ressources:
   ```bash
   aws logs delete-log-group  --log-group-name /ecs/secu/exec/magento-seb
   ```

## The project is Bootstrap with projen

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

# Troubleshoot magento

uses the script to exec into the task

```
ecs_exec_service magento magento-magentoService27FB24D3-VIUJrhZwrS2S magento
```

debug commands

```
apt-get update && apt-get install -y vim
set -o xtrace
/opt/bitnami/scripts/magento/setup.sh | less
source /opt/bitnami/scripts/magento/setup.sh  | more
```

magento execute this script at startup : `/bin/bash /opt/bitnami/scripts/magento/setup.sh`

## Mysql

ensure_dir_exists /bitnami/magento
configure_permissions_ownership /bitnami/magento -d 775 -f 664 -u daemon -g root
magento_wait_for_db_connection $MAGENTO_DATABASE_HOST 3306 magento magentouser 'Passw0rd!'

mysql -h $MAGENTO_DATABASE_HOST -u $MAGENTO_DATABASE_USER -p$MAGENTO_DATABASE_PASSWORD $MAGENTO_DATABASE_NAME

## Elasticsearch

The command executed in magento by the setup.sh script:

```
debug_execute wait-for-port --timeout 5 --host $ELASTICSEARCH_HOST 443
gosu daemon php /opt/bitnami/magento/bin/magento setup:install --no-interaction --backend-frontname admin --db-host $MAGENTO_DATABASE_HOST:3306 --db-name magento --db-user magentouser --db-password 'Passw0rd!' --search-engine elasticsearch7 --admin-firstname FirstName --admin-lastname LastName --admin-email user@example.com --admin-user user --admin-password bitnami1 --elasticsearch-host https://$ELASTICSEARCH_HOST --elasticsearch-port 443 --elasticsearch-enable-auth 1 --elasticsearch-username magento --elasticsearch-password Passw0rd!
```

You can test the elasticsearch connection in curl with

```
curl -XPOST -u "$MAGENTO_ELASTICSEARCH_USER:$MAGENTO_ELASTICSEARCH_PASSWORD" "https://$ELASTICSEARCH_HOST/_search" -H "content-type:application/json" -d'
{
"query": {
"match_all": {}
}
}'
```

```
curl -XPOST https://$ELASTICSEARCH_HOST/_plugin/kibana/auth/login -H "osd-xsrf: true" -H "content-type:application/json" -d '{"username":"$MAGENTO_ELASTICSEARCH_USER", "password" : "$MAGENTO_ELASTICSEARCH_PASSWORD"}' -c auth.txt
```

Add role to elasticsearch

```
curl -sS -u "${MAGENTO_ELASTICSEARCH_USER}:${MAGENTO_ELASTICSEARCH_PASSWORD}" \
 -X PATCH \
 "https://${ELASTICSEARCH_HOST}/\_opendistro/\_security/api/rolesmapping/all_access?pretty" \
 -H 'Content-Type: application/json' \
 -d'
[
{
"op": "add", "path": "/backend_roles", "value": ["'$ROLE_ARN"],
},
]
'
```

# Test with python

```
apt-get update
apt-get install -y python python-pip
pip install boto3 requests_aws4auth elasticsearch

cat << EOF > es.py
import boto3
import requests_aws4auth
import elasticsearch
from requests_aws4auth import AWS4Auth
from elasticsearch import Elasticsearch, RequestsHttpConnection
session = boto3.session.Session()
credentials = session.get_credentials()

awsauth = AWS4Auth(credentials.access_key,
credentials.secret_key,
session.region_name, 'es',
session_token=credentials.token)
es = Elasticsearch(
['search-xxx.es.amazonaws.com'],
http_auth=awsauth,
use_ssl=True,
verify_certs=True,
connection_class=RequestsHttpConnection,
port=443
)
print(es.info())
EOF
python es.py

cat << EOF > req.py
import boto3
import json
import requests
from requests_aws4auth import AWS4Auth

#Get Temporary Credentials
credentials = boto3.Session().get_credentials()

service = 'es'
region = 'eu-west-1'

url="https://search-magento-xxx.es.amazonaws.com"

awsauth = AWS4Auth(credentials.access_key, credentials.secret_key, region, service, session_token=credentials.token)

r=requests.get(url, auth=awsauth)
print(r.text)
EOF
```
