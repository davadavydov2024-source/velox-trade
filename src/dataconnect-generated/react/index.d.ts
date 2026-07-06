import { CreateUserData, CreateUserVariables, CreatePostData, CreatePostVariables, CreateInteractionData, CreateInteractionVariables, ListMyPostsData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateUser(options?: useDataConnectMutationOptions<CreateUserData, FirebaseError, CreateUserVariables>): UseDataConnectMutationResult<CreateUserData, CreateUserVariables>;
export function useCreateUser(dc: DataConnect, options?: useDataConnectMutationOptions<CreateUserData, FirebaseError, CreateUserVariables>): UseDataConnectMutationResult<CreateUserData, CreateUserVariables>;

export function useCreatePost(options?: useDataConnectMutationOptions<CreatePostData, FirebaseError, CreatePostVariables>): UseDataConnectMutationResult<CreatePostData, CreatePostVariables>;
export function useCreatePost(dc: DataConnect, options?: useDataConnectMutationOptions<CreatePostData, FirebaseError, CreatePostVariables>): UseDataConnectMutationResult<CreatePostData, CreatePostVariables>;

export function useCreateInteraction(options?: useDataConnectMutationOptions<CreateInteractionData, FirebaseError, CreateInteractionVariables>): UseDataConnectMutationResult<CreateInteractionData, CreateInteractionVariables>;
export function useCreateInteraction(dc: DataConnect, options?: useDataConnectMutationOptions<CreateInteractionData, FirebaseError, CreateInteractionVariables>): UseDataConnectMutationResult<CreateInteractionData, CreateInteractionVariables>;

export function useListMyPosts(options?: useDataConnectQueryOptions<ListMyPostsData>): UseDataConnectQueryResult<ListMyPostsData, undefined>;
export function useListMyPosts(dc: DataConnect, options?: useDataConnectQueryOptions<ListMyPostsData>): UseDataConnectQueryResult<ListMyPostsData, undefined>;
