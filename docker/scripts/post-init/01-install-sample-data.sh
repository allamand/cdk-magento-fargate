#!/bin/bash

# Install Magento sample datas.
#su daemon -s /bin/bash
if [[ "$MAGENTO_ADMIN_TASK" = "yes" ]]; then
  cd /bitnami/magento
  # #bin/magento maintenance:enable && \
  # php -d memory_limit=-1 bin/magento sampledata:deploy
  # php -d memory_limit=-1 bin/magento setup:upgrade
  # php -d memory_limit=-1 bin/magento setup:static-content:deploy -f --area=frontend en_US
  # php -d memory_limit=-1 bin/magento indexer:reindex
  # php -d memory_limit=-1 bin/magento catalog:image:resize
  # php -d memory_limit=-1 bin/magento cache:flush


  # chown -R daemon:daemon /bitnami/magento/
  info "*Enabling Maintenance Mode*"
  bin/magento maintenance:enable
  info "**Installing Sample Application"
  php bin/magento config:set dev/js/minify_files 1  && \
  php bin/magento config:set dev/css/minify_files 1 && \
  php bin/magento config:set dev/js/enable_js_bundling 1 &&
  php bin/magento config:set dev/css/merge_css_files 1 &&
  php bin/magento config:set dev/static/sign 1 &&
  php bin/magento config:set dev/js/minify_files 1 && \
  php -d memory_limit=-1 bin/magento sampledata:deploy && \
  php bin/magento setup:upgrade && \
  php -d memory_limit=-1  bin/magento setup:static-content:deploy -f --area=frontend en_US && \
  php bin/magento cache:flush

  info "*disabling maintenance mode*"
  bin/magento maintenance:disable


  date >> init.log
  #bin/magento maintenance:disable
fi