FROM bitnami/magento
LABEL maintainer "Bitnami <containers@bitnami.com>"

USER root

## Install 'vim'
RUN install_packages vim



RUN chown -R daemon:daemon /opt/bitnami/
RUN chown -R daemon:daemon /bitnami/magento

COPY setup.sh /
#Custom Entrypoint to update Magento Host
COPY entrypoint.sh /opt/bitnami/scripts/magento/
## Enable mod_ratelimit module
#RUN sed -i -r 's/#LoadModule ratelimit_module/LoadModule ratelimit_module/' /opt/bitnami/apache/conf/httpd.conf

USER daemon
