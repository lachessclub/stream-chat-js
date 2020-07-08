import { UserFromToken, JWTServerToken, JWTUserToken } from './signing';
import { isFunction } from './utils';
import { User, TokenOrProvider } from '../types/types';

/**
 * TokenManager
 *
 * Handles all the operations around user token.
 */
export class TokenManager {
  loadTokenPromise: Promise<string> | null;
  type: 'static' | 'provider';
  secret?: string;
  token?: string | null;
  tokenProvider?: TokenOrProvider;
  user?: User | null;
  /**
   * Constructor
   *
   * @param {object} secret
   */
  constructor(secret?: string) {
    this.loadTokenPromise = null;
    if (secret) {
      this.secret = secret;
    }

    this.type = 'static';

    if (this.secret) {
      this.token = JWTServerToken(this.secret);
    }
  }

  /**
   * Set the static string token or token provider.
   * Token provider should return a token string or a promise which resolves to string token.
   *
   * @param {string | function} tokenOrProvider
   */
  setTokenOrProvider = async (
    tokenOrProvider: TokenOrProvider,
    user: User,
  ): Promise<void> => {
    this.validateToken(tokenOrProvider, user);
    this.user = user;

    if (isFunction(tokenOrProvider)) {
      this.tokenProvider = tokenOrProvider;
      this.type = 'provider';
    }

    if (typeof tokenOrProvider === 'string') {
      this.token = tokenOrProvider;
      this.type = 'static';
    }

    if (!tokenOrProvider && this.user && this.secret) {
      this.token = JWTUserToken(this.secret, user.id, {}, {});
      this.type = 'static';
    }

    await this.loadToken();
  };

  /**
   * Resets the token manager.
   * Useful for client disconnection or switching user.
   */
  reset = (): void => {
    this.token = null;
    this.user = null;
    this.loadTokenPromise = null;
  };

  // Validates the user token.
  validateToken = (tokenOrProvider: TokenOrProvider, user: User): void => {
    // allow empty token for anon user
    if (user && user.anon && !tokenOrProvider) return;

    // Don't allow empty token for non-server side client.
    if (!this.secret && !tokenOrProvider) {
      throw new Error('User token can not be empty');
    }

    if (
      tokenOrProvider &&
      typeof tokenOrProvider !== 'string' &&
      !isFunction(tokenOrProvider)
    ) {
      throw new Error('user token should either be a string or a function');
    }

    if (typeof tokenOrProvider === 'string') {
      // Allow empty token for anonymous users
      if (user.anon && tokenOrProvider === '') return;

      const tokenUserId = UserFromToken(tokenOrProvider);
      if (
        tokenOrProvider != null &&
        (tokenUserId == null || tokenUserId === '' || tokenUserId !== user.id)
      ) {
        throw new Error(
          'userToken does not have a user_id or is not matching with user.id',
        );
      }
    }
  };

  // Resolves when token is ready. This function is simply to check if loadToken is in progress, in which
  // case a function should wait.
  tokenReady = (): Promise<string> | null => this.loadTokenPromise;

  // Fetches a token from tokenProvider function and sets in tokenManager.
  // In case of static token, it will simply resolve to static token.
  loadToken = (): Promise<string> => {
    // eslint-disable-next-line no-async-promise-executor
    this.loadTokenPromise = new Promise(async resolve => {
      if (this.type === 'static' && this.token) {
        return resolve(this.token);
      }

      if (this.tokenProvider && typeof this.tokenProvider !== 'string') {
        this.token = await this.tokenProvider();
        resolve(this.token);
      }
    });

    return this.loadTokenPromise;
  };

  // Returns a current token
  getToken = (): string | undefined | null => {
    if (this.token) {
      return this.token;
    }

    if (this.user && this.user.anon && !this.token) {
      return this.token;
    }

    if (this.secret) {
      return JWTServerToken(this.secret);
    }

    throw new Error(
      `Both secret and user tokens are not set. Either client.setUser wasn't called or client.disconnect was called`,
    );
  };

  isStatic = (): boolean => this.type === 'static';
}
