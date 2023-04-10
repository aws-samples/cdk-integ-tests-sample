// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag';
import { Construct, IConstruct } from 'constructs';
import { CfnResource } from 'aws-cdk-lib';


interface CdkIntegTestsDemoStackProps extends cdk.StackProps {
  setDestroyPolicyToAllResources?: boolean;
}

export class CdkIntegTestsDemoStack extends cdk.Stack {
  public readonly topicArn: string;
  public readonly tableName: string;
  public readonly kmsKeyArn: string;

  constructor(scope: Construct, id: string, props?: CdkIntegTestsDemoStackProps) {
    super(scope, id, props);

    // KMS key for server-side encryption
    const kmsKey = new kms.Key(this, 'TopicKey', {
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.kmsKeyArn = kmsKey.keyArn;

    // SNS topic
    const snsTopic = new sns.Topic(this, 'CDKIntegTestTopic', {
      masterKey: kmsKey,
    });
    this.topicArn = snsTopic.topicArn;

    // SQS queues
    const dlq = new sqs.Queue(this, 'QueueDlq', {
      enforceSSL: true,
    });
    NagSuppressions.addResourceSuppressions(dlq, [
      {
        id: 'AwsSolutions-SQS3',
        reason: 'Ignore dead-letter queue (DLQ) for DLQ',
      },
    ]);

    const sqsQueue = new sqs.Queue(this, 'Queue', {
      enforceSSL: true,
      deadLetterQueue: {
        maxReceiveCount: 2,
        queue: dlq,
      },
    });

    // DynamoDB
    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.tableName = table.tableName;

    // Consumer Lambda function
    const functionName = `integ-consumer-${this.stackName}`;
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const lambdaRole = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        logging: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [logGroup.logGroupArn],
            }),
          ],
        }),
      },
    });

    const consumerFunction = new lambdaNodejs.NodejsFunction(
      this,
      'ConsumerLambda',
      {
        functionName: functionName,
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: path.join(__dirname, './functions/sqs-ddb-function.ts'),
        timeout: cdk.Duration.seconds(30),
        environment: {
          TABLE_NAME: table.tableName,
        },
        role: lambdaRole,
      },
    );
    table.grantWriteData(consumerFunction);

    // SQS Queue subscribes to SNS
    snsTopic.addSubscription(new snsSubscriptions.SqsSubscription(sqsQueue));

    // AWS Consumer Lambda is triggered by SQS
    consumerFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(sqsQueue),
    );

    // If Destroy Policy Aspect is present:
    if (props && props.setDestroyPolicyToAllResources) {
      cdk.Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    }
  }
}

/**
 * AWS CDK Aspect Class used to set a removal policy to Destroy for all resources
 * deployed via this stack.
 */
class ApplyDestroyPolicyAspect implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
  }
}
