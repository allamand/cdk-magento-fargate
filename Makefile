
diff:
	npx cdk diff

synth:
	npx cdk synth	

deploy:
	npx cdk deploy --require-approval=never

destroy:
	npx cdk destroy

describe:
	aws cloudformation describe-stacks --stack-name magento --region eu-west-1 --query "Stacks[*].Outputs" --output table 

connect:
	@echo $(shell aws cloudformation describe-stacks --stack-name magento --region eu-west-1 --query "Stacks[*].Outputs[?contains(OutputKey, 'EcsExecCommandMagento')].OutputValue" --output text)


	