#!/bin/bash

# Install Magento sample datas.
su daemon -s /bin/bash
cd /bitnami/magento
bin/magento maintenance:enable && \
php -d memory_limit=-1 bin/magento setup:upgrade && \
php -d memory_limit=-1 bin/magento sampledata:deploy && \
php -d memory_limit=-1 bin/magento setup:static-content:deploy -f && \
php -d memory_limit=-1 bin/magento indexer:reindex && \
php -d memory_limit=-1 bin/magento catalog:image:resize && \
php -d memory_limit=-1 bin/magento cache:flush && \
bin/magento maintenance:disable
