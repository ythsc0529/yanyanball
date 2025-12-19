import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
export { auth };

export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
};

export const logout = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout failed:", error);
    }
};

export const onUserStatusChanged = (callback) => {
    onAuthStateChanged(auth, (user) => {
        callback(user);
    });
};

export const loginAsGuest = () => {
    // Guest mode doesn't really 'login' to Firebase, 
    // but sets a local state or just navigates to the app.
    localStorage.setItem('guestMode', 'true');
    window.location.href = '/app.html'; // Or handle routing
};
