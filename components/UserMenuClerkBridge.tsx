import React from 'react';
import { useUser } from '@clerk/react';
import UserMenu, { type UserMenuProps } from './UserMenu';

export type UserMenuClerkBridgeProps = Omit<UserMenuProps, 'avatarUrl'>;

/**
 * Só monte este componente quando a árvore estiver dentro de {@link ClerkProvider}
 * (ex.: `TEMPORARILY_DISABLE_CLERK === false` em index.tsx).
 */
const UserMenuClerkBridge: React.FC<UserMenuClerkBridgeProps> = props => {
  const { user } = useUser();
  return <UserMenu {...props} avatarUrl={user?.imageUrl ?? null} />;
};

export default UserMenuClerkBridge;
