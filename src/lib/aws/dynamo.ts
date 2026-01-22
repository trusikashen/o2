import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ 
  region: process.env.AWS_REGION || 'us-east-1'
});

export const ddbDocClient = DynamoDBDocumentClient.from(client);

export const BOT_FAMILIES_TABLE = process.env.DYNAMODB_BOT_FAMILIES_TABLE || 'BotFamilies';
export const BOT_INSTANCES_TABLE = process.env.DYNAMODB_BOT_INSTANCES_TABLE || 'BotInstances';
export const YOUTUBE_RUNS_TABLE = process.env.DYNAMODB_YOUTUBE_RUNS_TABLE || 'YouTubeRuns';
export const YOUTUBE_BOTS_TABLE = process.env.DYNAMODB_YOUTUBE_BOTS_TABLE || 'YouTubeBots';

