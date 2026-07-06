import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface CreateInteractionData {
  interaction_insert: Interaction_Key;
}

export interface CreateInteractionVariables {
  postId: UUIDString;
  status: string;
}

export interface CreatePostData {
  post_insert: Post_Key;
}

export interface CreatePostVariables {
  title: string;
  description: string;
  locationPoint: string;
  status: string;
}

export interface CreateUserData {
  user_insert: User_Key;
}

export interface CreateUserVariables {
  username: string;
  email: string;
  locationPoint: string;
}

export interface Feedback_Key {
  id: UUIDString;
  __typename?: 'Feedback_Key';
}

export interface Interaction_Key {
  id: UUIDString;
  __typename?: 'Interaction_Key';
}

export interface ListMyPostsData {
  posts: ({
    title: string;
    description: string;
    status: string;
    interactions_on_post: ({
      status: string;
      helper: {
        username: string;
      };
    })[];
  })[];
}

export interface Message_Key {
  id: UUIDString;
  __typename?: 'Message_Key';
}

export interface Post_Key {
  id: UUIDString;
  __typename?: 'Post_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

/** Generated Node Admin SDK operation action function for the 'CreateUser' Mutation. Allow users to execute without passing in DataConnect. */
export function createUser(dc: DataConnect, vars: CreateUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateUserData>>;
/** Generated Node Admin SDK operation action function for the 'CreateUser' Mutation. Allow users to pass in custom DataConnect instances. */
export function createUser(vars: CreateUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateUserData>>;

/** Generated Node Admin SDK operation action function for the 'CreatePost' Mutation. Allow users to execute without passing in DataConnect. */
export function createPost(dc: DataConnect, vars: CreatePostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreatePostData>>;
/** Generated Node Admin SDK operation action function for the 'CreatePost' Mutation. Allow users to pass in custom DataConnect instances. */
export function createPost(vars: CreatePostVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreatePostData>>;

/** Generated Node Admin SDK operation action function for the 'CreateInteraction' Mutation. Allow users to execute without passing in DataConnect. */
export function createInteraction(dc: DataConnect, vars: CreateInteractionVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateInteractionData>>;
/** Generated Node Admin SDK operation action function for the 'CreateInteraction' Mutation. Allow users to pass in custom DataConnect instances. */
export function createInteraction(vars: CreateInteractionVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateInteractionData>>;

/** Generated Node Admin SDK operation action function for the 'ListMyPosts' Query. Allow users to execute without passing in DataConnect. */
export function listMyPosts(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ListMyPostsData>>;
/** Generated Node Admin SDK operation action function for the 'ListMyPosts' Query. Allow users to pass in custom DataConnect instances. */
export function listMyPosts(options?: OperationOptions): Promise<ExecuteOperationResponse<ListMyPostsData>>;

