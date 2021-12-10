FROM bitnami/magento
LABEL maintainer "Bitnami <containers@bitnami.com>"

## Install 'vim'
RUN install_packages vim
RUN chown -R daemon:daemon /opt/bitnami/

COPY setup.sh /
## Enable mod_ratelimit module
#RUN sed -i -r 's/#LoadModule ratelimit_module/LoadModule ratelimit_module/' /opt/bitnami/apache/conf/httpd.conf

USER daemon
