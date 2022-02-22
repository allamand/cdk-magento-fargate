FROM bitnami/magento
LABEL maintainer "Bitnami <containers@bitnami.com>"

USER root

## Install 'vim'
RUN install_packages vim

RUN chown -R daemon:daemon /opt/bitnami/
RUN chown -R daemon:daemon /bitnami/magento

COPY insta /ll_sample_datas.sh

#Custom Entrypoint to update Magento Host
COPY entrypoint.sh /opt/bitnami/scripts/magento/

USER daemon
