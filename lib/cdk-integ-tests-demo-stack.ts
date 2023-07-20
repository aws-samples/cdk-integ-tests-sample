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
import { Construct, IConstruct } from 'constructs';
import { CfnResource } from 'aws-cdk-lib';

interface CdkIntegTestsDemoStackProps extends cdk.StackProps {
  /**
   * Whether to set all removal policies to DESTROY
   */
  setDestroyPolicyToAllResources?: boolean;
}

/**
 * The demo application stack defining a serverless data enrichment stack
 */
export class CdkIntegTestsDemoStack extends cdk.Stack {
  public readonly topicArn: string;
  public readonly tableName: string;
  public readonly kmsKeyArn: string;
  public readonly functionName: string;

  constructor(
    scope: Construct,
    id: string,
    props?: CdkIntegTestsDemoStackProps,
  ) {
    super(scope, id, props);

    // KMS key for server-side encryption
    const kmsKey = new kms.Key(this, 'KmsKey', {
      enableKeyRotation: true,
    });
    this.kmsKeyArn = kmsKey.keyArn;

    // SNS topic
    const snsTopic = new sns.Topic(this, 'Topic', {
      masterKey: kmsKey,
    });
    this.topicArn = snsTopic.topicArn;

    // SQS queue with a dead letter queue
    const dlq = new sqs.Queue(this, 'Dlq', {
      enforceSSL: true,
    });

    const sqsQueue = new sqs.Queue(this, 'Queue', {
      enforceSSL: true,
      deadLetterQueue: {
        maxReceiveCount: 2,
        queue: dlq,
      },
    });

    // DynamoDB table
    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });
    this.tableName = table.tableName;

    // Lambda function
    const functionName = `integ-lambda-${this.stackName}`;

    // The lambda function's log group
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
    });

    // The Lambda function's role with logging permissions
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

    // The lambda enricher function
    const enricherFunction = new lambdaNodejs.NodejsFunction(
      this,
      'EnricherLambda',
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
    this.functionName = enricherFunction.functionName;

    // Allow Lambda to write data to the DynamoDB table
    table.grantWriteData(enricherFunction);

    // SQS Queue subscribes to SNS
    snsTopic.addSubscription(new snsSubscriptions.SqsSubscription(sqsQueue));

    // Lambda is triggered by SQS
    enricherFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(sqsQueue),
    );

    // If Destroy Policy Aspect is present:
    if (props?.setDestroyPolicyToAllResources) {
      cdk.Aspects.of(this).add(new ApplyDestroyPolicyAspect());
    }
  }
}
/**
 * Aspect for setting all removal policies to DESTROY
 */
class ApplyDestroyPolicyAspect implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      node.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }
  }
}
