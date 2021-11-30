
CDK_STACK_NAME?=magento

stack:
	echo $(CDK_STACK_NAME)
diff: projen
	npx cdk diff

synth: projen
	npx cdk synth	

deploy: projen
	npx cdk deploy --require-approval=never

destroy:
	npx cdk destroy

describe:
	aws cloudformation describe-stacks --stack-name $(CDK_STACK_NAME) --query "Stacks[*].Outputs" --output table 

connect:
	@echo $(shell aws cloudformation describe-stacks --stack-name $(CDK_STACK_NAME) --query "Stacks[*].Outputs[?contains(OutputKey, 'EcsExecCommandMagentoService')].OutputValue" --output text)
	@echo $(shell aws cloudformation describe-stacks --stack-name $(CDK_STACK_NAME) --query "Stacks[*].Outputs[?contains(OutputKey, 'EcsExecCommandEksUtils')].OutputValue" --output text)

projen:
	npx projen

	