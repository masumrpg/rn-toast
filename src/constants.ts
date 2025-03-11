import { Platform } from 'react-native';

export const ASSETS = {
  success: Platform.select({
    default: require('./assets/images/success.png'),
  }),
  error: Platform.select({
    default: require('./assets/images/error.png'),
  }),
  info: Platform.select({
    default: require('./assets/images/info.png'),
  }),
};