#!/bin/bash

# Install Magento sample datas.
#su daemon -s /bin/bash
if [[ "$MAGENTO_ADMIN_TASK" = "yes" && ! -f /bitnami/magento/__INIT_IS_OK__ ]]; then
  echo "--- STARTING INIT ---"
  cd /bitnami/magento

  echo "**update magento credentials"
    #TODO: do it only on Admin ?
    cd /bitnami/magento
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

  # chown -R daemon:daemon /bitnami/magento/
  echo "*Enabling Maintenance Mode*"
  bin/magento maintenance:enable
  echo "**Installing Sample Application"
  # php bin/magento config:set dev/js/minify_files 1
  # php bin/magento config:set dev/css/minify_files 1
  # php bin/magento config:set dev/js/enable_js_bundling 1
  # php bin/magento config:set dev/css/merge_css_files 1
  # php bin/magento config:set dev/static/sign 1
  # php bin/magento config:set dev/js/minify_files 1
  php -d memory_limit=-1 bin/magento setup:upgrade
  php -d memory_limit=-1 bin/magento sampledata:deploy
  php -d memory_limit=-1 bin/magento setup:static-content:deploy -f
  php -d memory_limit=-1 bin/magento indexer:reindex
  php -d memory_limit=-1 bin/magento catalog:image:resize
  php -d memory_limit=-1 bin/magento cache:flush

  echo "*disabling maintenance mode*"
  bin/magento maintenance:disable

  touch /bitnami/magento/__INIT_IS_OK__
else
  echo "--- STARTING DO NOTHING ---"
fi