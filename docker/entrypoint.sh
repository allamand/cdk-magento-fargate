#!/bin/bash

# shellcheck disable=SC1091

set -o errexit
set -o nounset
set -o pipefail
# set -o xtrace # Uncomment this line for debugging purpose

# Load Magento environment
. /opt/bitnami/scripts/magento-env.sh

# Load libraries
. /opt/bitnami/scripts/libbitnami.sh
. /opt/bitnami/scripts/liblog.sh
. /opt/bitnami/scripts/libwebserver.sh

print_welcome_page

if [[ "$1" = "/opt/bitnami/scripts/magento/run.sh" || "$1" = "/opt/bitnami/scripts/$(web_server_type)/run.sh" || "$1" = "/opt/bitnami/scripts/nginx-php-fpm/run.sh" ]]; then
    info "** Starting Magento setup **"
    /opt/bitnami/scripts/"$(web_server_type)"/setup.sh
    info "** Starting Magento setup php**"
    /opt/bitnami/scripts/php/setup.sh
    info "** Starting Magento setup mysql**"
    /opt/bitnami/scripts/mysql-client/setup.sh
    info "** Starting Magento magento **"
    #TODO If not in Admin
     if [[ "$MAGENTO_ADMIN_TASK" = "no" ]]; then
       sed -i 's/        info "Upgrading database schema"/        info "DISABLE Upgrading database schema"/' /opt/bitnami/scripts/libmagento.sh
       sed -i 's/        magento_execute setup:upgrade/        #magento_execute setup:upgrade/' /opt/bitnami/scripts/libmagento.sh
    fi
    /opt/bitnami/scripts/magento/setup.sh
    info "** Starting Magento post **"
    /post-init.sh
    info "** Magento setup finished! **"
fi



if [[ "$MAGENTO_USE_EFS" = "yes" && -d /bitnami/magento/bin ]]; then

    info "**update magento credentials"
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
    # chown -R daemon:daemon /bitnami/magento/var/composer_home/

    # info "**update magento"
    # bin/magento config:set web/secure/base_url https://$MAGENTO_HOST/
    # bin/magento config:set web/unsecure/base_url http://$MAGENTO_HOST/
    # php bin/magento setup:upgrade && \
    # php bin/magento setup:static-content:deploy -f && \
    # php bin/magento cache:flush
fi
echo ""
exec "$@"