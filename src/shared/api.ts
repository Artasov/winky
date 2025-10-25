import axios from 'axios';
import { API_BASE_URL } from './constants';

export const createApiClient = (accessToken?: string) => {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  if (accessToken) {
    instance.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
  }

  return instance;
};

export const apiClient = createApiClient();
