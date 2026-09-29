import React, { useEffect, useState } from 'react';
import CaseLifecycleScreen from '../../src/screens/CaseLifecycleScreen';
import { authService } from '../../src/auth/authService';

export default function CasesRoute() {
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    authService.getCurrentUser().then(user => {
      setUserProfile(user);
    });
  }, []);

  return <CaseLifecycleScreen userProfile={userProfile} />;
}
