import React, { useEffect, useState } from 'react';
import GrievanceRegistrationScreen from '../../src/screens/GrievanceRegistrationScreen';
import { authService } from '../../src/auth/authService';

export default function CasesRoute() {
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    authService.getCurrentUser().then(user => {
      setUserProfile(user);
    });
  }, []);

  return <GrievanceRegistrationScreen userProfile={userProfile} />;
}
