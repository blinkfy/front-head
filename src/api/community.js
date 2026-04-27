/**
 * 环保社区 API
 */
import request from '@/api/index.js';

export function getCommunityList(district = null) {
  return request({
    url: '/api/community/list',
    method: 'GET',
    data: district ? { district } : {},
    needAuth: true
  });
}

export function getMyCommunity() {
  return request({
    url: '/api/community/mine',
    method: 'GET',
    needAuth: true
  });
}

export function getCommunityTree() {
  return request({
    url: '/api/community/tree',
    method: 'GET',
    needAuth: true
  });
}

export function joinCommunity(community) {
  const data = community && typeof community === 'object'
    ? community
    : { communityId: community };
  return request({
    url: '/api/community/join',
    method: 'POST',
    data,
    needAuth: true
  });
}

export function getCommunityPosts(communityId, tag = null, sort = 'latest', page = 1, limit = 20, includeImages = false) {
  const data = { communityId, sort, page, limit };
  if (tag) data.tag = tag;
  if (includeImages) data.includeImages = 'true';
  return request({
    url: '/api/community/posts',
    method: 'GET',
    data,
    needAuth: true
  });
}

export function getCommunityCover(communityId) {
  return request({
    url: '/api/community/cover',
    method: 'GET',
    data: { communityId },
    needAuth: true
  });
}

export function getCommunityPostImages(postId) {
  return request({
    url: '/api/community/post/images',
    method: 'GET',
    data: { postId },
    needAuth: true
  });
}

export function createPost(communityId, content, images = [], tag = '心得') {
  return request({
    url: '/api/community/post/create',
    method: 'POST',
    data: { communityId, content, images, tag },
    needAuth: true
  });
}

export function togglePostLike(postId) {
  return request({
    url: '/api/community/post/like',
    method: 'POST',
    data: { postId },
    needAuth: true
  });
}

export function deleteCommunityPost(postId) {
  return request({
    url: `/api/community/post/${postId}`,
    method: 'DELETE',
    needAuth: true
  });
}

export function addComment(postId, content, parentId = null) {
  return request({
    url: '/api/community/post/comment',
    method: 'POST',
    data: { postId, content, parentId },
    needAuth: true
  });
}

export function getComments(postId, page = 1, limit = 20) {
  return request({
    url: '/api/community/post/comments',
    method: 'GET',
    data: { postId, page, limit },
    needAuth: true
  });
}

export function deleteCommunityComment(commentId) {
  return request({
    url: `/api/community/comment/${commentId}`,
    method: 'DELETE',
    needAuth: true
  });
}

export function getCommunityRanking() {
  return request({
    url: '/api/community/ranking',
    method: 'GET',
    needAuth: true
  });
}

export function getMemberRanking(communityId, limit = 50) {
  return request({
    url: '/api/community/member-ranking',
    method: 'GET',
    data: { communityId, limit },
    needAuth: true
  });
}
