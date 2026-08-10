import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise, DataConnectSettings } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;
export const dataConnectSettings: DataConnectSettings;

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

interface CreateUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateUserVariables): MutationRef<CreateUserData, CreateUserVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateUserVariables): MutationRef<CreateUserData, CreateUserVariables>;
  operationName: string;
}
export const createUserRef: CreateUserRef;

export function createUser(vars: CreateUserVariables): MutationPromise<CreateUserData, CreateUserVariables>;
export function createUser(dc: DataConnect, vars: CreateUserVariables): MutationPromise<CreateUserData, CreateUserVariables>;

interface CreatePostRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreatePostVariables): MutationRef<CreatePostData, CreatePostVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreatePostVariables): MutationRef<CreatePostData, CreatePostVariables>;
  operationName: string;
}
export const createPostRef: CreatePostRef;

export function createPost(vars: CreatePostVariables): MutationPromise<CreatePostData, CreatePostVariables>;
export function createPost(dc: DataConnect, vars: CreatePostVariables): MutationPromise<CreatePostData, CreatePostVariables>;

interface CreateInteractionRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateInteractionVariables): MutationRef<CreateInteractionData, CreateInteractionVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateInteractionVariables): MutationRef<CreateInteractionData, CreateInteractionVariables>;
  operationName: string;
}
export const createInteractionRef: CreateInteractionRef;

export function createInteraction(vars: CreateInteractionVariables): MutationPromise<CreateInteractionData, CreateInteractionVariables>;
export function createInteraction(dc: DataConnect, vars: CreateInteractionVariables): MutationPromise<CreateInteractionData, CreateInteractionVariables>;

interface ListMyPostsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListMyPostsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListMyPostsData, undefined>;
  operationName: string;
}
export const listMyPostsRef: ListMyPostsRef;

export function listMyPosts(options?: ExecuteQueryOptions): QueryPromise<ListMyPostsData, undefined>;
export function listMyPosts(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListMyPostsData, undefined>;

