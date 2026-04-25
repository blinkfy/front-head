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

export function joinCommunity(communityId) {
  return request({
    url: '/api/community/join',
    method: 'POST',
    data: { communityId },
    needAuth: true
  });
}

export function getCommunityPosts(communityId, tag = null, sort = 'latest', page = 1, limit = 20) {
  return request({
    url: '/api/community/posts',
    method: 'GET',
    data: { communityId, tag, sort, page, limit },
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
