#!/bin/bash

cd /bitnami/magento
bin/magento maintenance:enable
mkdir -p /bitnami/magento/var/composer_home/
cat <<END > /bitnami/magento/var/composer_home/auth.json
{
    "http-basic": {
        "repo.magento.com": {
            "username": "$MAGENTO_MARKETPLACE_PUBLIC_KEY",
            "password": "$MAGENTO_MARKETPLACE_PRIVATE_KEY"
        }
    }
}
END
#chown -R daemon:daemon /bitnami/magento/var/composer_home/
#rm -rf /opt/bitnami/magento/var/cache/*
#rm -rf /opt/bitnami/magento/var/page_cache/*
#rm -rf /opt/bitnami/magento/generated/*
php -d memory_limit=-1 bin/magento sampledata:deploy && \
php -d memory_limit=-1 bin/magento setup:upgrade && \
php -d memory_limit=-1 bin/magento setup:di:compile && \
php -d memory_limit=-1 bin/magento setup:static-content:deploy -f && \
php -d memory_limit=-1 bin/magento catalog:image:resize
#php bin/magento cache:flush
#chown -R daemon:daemon /bitnami/magento/
bin/magento maintenance:disable