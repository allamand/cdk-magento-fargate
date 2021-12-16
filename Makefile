
CDK_STACK_NAME?=magento

stack:
	echo $(CDK_STACK_NAME)
diff: projen
	npx cdk diff

synth: projen
	npx cdk synth	

build:
	npx projen build
	
deploy: projen
	npx cdk deploy --require-approval=never

destroy:
	npx cdk destroy

describe:
	aws cloudformation describe-stacks --stack-name $(CDK_STACK_NAME) --query "Stacks[*].Outputs" --output table 

connect:
	@echo $(shell aws cloudformation describe-stacks --stack-name $(CDK_STACK_NAME) --query 'Stacks[*].Outputs[?OutputKey==`EcsExecCommandMagentoService`].OutputValue' --output text)
	@echo $(shell aws cloudformation describe-stacks --stack-name $(CDK_STACK_NAME) --query 'Stacks[*].Outputs[?OutputKey==`EcsExecCommandMagentoServiceAdmin`].OutputValue' --output text)

projen:
	npx projen

#run npx projen build in this not-connected container to simulate gh action build
local-test:
	 docker run -ti -v $PWD:/src -w /src --net none allamand/eksutils zsh    
	