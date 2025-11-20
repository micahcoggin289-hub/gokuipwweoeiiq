import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  orderBy,
  limit,
}
 from 'firebase/firestore';

// --- Global Variable Access (MANDATORY) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-chat-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- TENOR API Configuration ---
// Key provided by the user.
const TENOR_API_KEY = 'AIzaSyDRzUQ243vuMJvCqWpFID3PFAfMGOKvkbw'; 
const TENOR_CLIENT_KEY = 'prochat_app'; // Required client key for Tenor
const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2';

// Tenor Endpoints (using a limit of 12 and content filter for safety)
const TENOR_TRENDING_URL = `${TENOR_BASE_URL}/featured?key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&limit=12&contentfilter=high`;
const TENOR_SEARCH_URL = (query) => `${TENOR_BASE_URL}/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&limit=12&contentfilter=high`;


// Ensure configuration is available before initializing
let app, auth, db;
if (Object.keys(firebaseConfig).length > 0) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    // Set variables to null if initialization fails
    app = null;
    db = null;
    auth = null;
  }
}

// --- Firestore Path Helpers ---
const getPublicCollection = (name) => collection(db, `artifacts/${appId}/public/data/${name}`);
const getUserProfileDoc = (uid) => doc(db, `artifacts/${appId}/users/${uid}/profile/info`);
const getUserFriendsCollection = (uid) => collection(db, `artifacts/${appId}/users/${uid}/friends`);

// --- UI Components ---

/**
 * Custom alert/toast component to replace window.alert
 */
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colorClasses = {
    error: 'bg-red-500',
    success: 'bg-green-500',
    info: 'bg-blue-500',
  };

  return (
    <div className={`fixed top-4 right-4 p-4 rounded-lg shadow-xl text-white z-50 transition-opacity duration-300 ${colorClasses[type]}`}>
      {message}
    </div>
  );
};


/**
 * Handles user authentication (Login/Register)
 */
const AuthView = ({ setUserId, setUsername, setAuthError, setAuthReady }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async () => {
    if (!email || !password || (!isLogin && !displayName)) {
      setError('Please fill out all fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let userCredential;
      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });

        // Save initial profile data to Firestore
        await setDoc(getUserProfileDoc(userCredential.user.uid), {
          username: displayName,
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          status: 'online',
        });
      }
      setUserId(userCredential.user.uid);
      setUsername(userCredential.user.displayName || 'User');
      setAuthReady(true);

    } catch (e) {
      console.error('Auth Error:', e);
      let message = 'An unknown authentication error occurred.';
      if (e.code === 'auth/email-already-in-use') message = 'Email already in use. Try logging in.';
      else if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password') message = 'Invalid credentials.';
      else if (e.code === 'auth/weak-password') message = 'Password should be at least 6 characters.';

      setError(message);
      setAuthError(message);

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-gray-800 p-8 shadow-2xl">
        <h2 className="text-center text-3xl font-extrabold text-white">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        {error && (
          <div className="rounded-md bg-red-600 p-3 text-sm font-medium text-white shadow-md">
            {error}
          </div>
        )}
        <div className="space-y-4">
          {!isLogin && (
            <input
              type="text"
              placeholder="Username"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-700 p-3 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 p-3 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 p-3 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500"
            disabled={loading}
          />
        </div>
        <button
          onClick={handleAuth}
          className="w-full rounded-lg bg-indigo-600 p-3 font-semibold text-white transition duration-200 hover:bg-indigo-700 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Register')}
        </button>
        <div className="text-center text-sm text-gray-400">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="font-medium text-indigo-400 hover:text-indigo-300"
            disabled={loading}
          >
            {isLogin ? 'Register' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
};


/**
 * Manages sending and receiving friend requests
 */
const FriendRequestsView = ({ currentUserId, friends, allUsers, setToastMessage }) => {
  const [usernameQuery, setUsernameQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pendingSentRequests, setPendingSentRequests] = useState([]);
  const [pendingReceivedRequests, setPendingReceivedRequests] = useState([]);

  // Fetch pending requests and search for users
  useEffect(() => {
    if (!db || !currentUserId) return;

    // 1. Listen for requests SENT by the current user
    const sentQ = query(
      getPublicCollection('friendRequests'),
      where('senderId', '==', currentUserId),
      where('status', '==', 'pending')
    );
    const unsubscribeSent = onSnapshot(sentQ, (snapshot) => {
      setPendingSentRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 2. Listen for requests RECEIVED by the current user
    const receivedQ = query(
      getPublicCollection('friendRequests'),
      where('receiverId', '==', currentUserId),
      where('status', '==', 'pending')
    );
    const unsubscribeReceived = onSnapshot(receivedQ, (snapshot) => {
      setPendingReceivedRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeSent();
      unsubscribeReceived();
    };
  }, [currentUserId]);

  // Handle user search (Uses the local 'allUsers' prop for client-side filtering)
  useEffect(() => {
    if (!allUsers || !usernameQuery) {
      setSearchResults([]);
      return;
    }

    const filtered = allUsers
      .filter(u => u.username.toLowerCase().includes(usernameQuery.toLowerCase()) && u.uid !== currentUserId)
      .slice(0, 5); // Limit to top 5 results
    setSearchResults(filtered);

  }, [usernameQuery, allUsers, currentUserId]);


  const sendFriendRequest = async (receiverId, receiverUsername) => {
    try {
      // Check for existing pending request (sender -> receiver)
      const existingSentQ = query(
        getPublicCollection('friendRequests'),
        where('senderId', '==', currentUserId),
        where('receiverId', '==', receiverId),
        where('status', '==', 'pending')
      );
      const existingSentSnapshot = await getDocs(existingSentQ);
      if (!existingSentSnapshot.empty) {
        setToastMessage({ message: `Request already sent to ${receiverUsername}.`, type: 'info' });
        return;
      }

      // Check for existing pending request (receiver -> sender)
      const existingReceivedQ = query(
        getPublicCollection('friendRequests'),
        where('senderId', '==', receiverId),
        where('receiverId', '==', currentUserId),
        where('status', '==', 'pending')
      );
      const existingReceivedSnapshot = await getDocs(existingReceivedQ);
      if (!existingReceivedSnapshot.empty) {
        setToastMessage({ message: `${receiverUsername} has already sent you a request. Check 'Pending Received Requests'.`, type: 'info' });
        return;
      }

      await addDoc(getPublicCollection('friendRequests'), {
        senderId: currentUserId,
        senderUsername: auth.currentUser.displayName,
        receiverId: receiverId,
        receiverUsername: receiverUsername,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setToastMessage({ message: `Request sent to ${receiverUsername}!`, type: 'success' });
    } catch (error) {
      console.error('Error sending friend request:', error);
      setToastMessage({ message: 'Failed to send request.', type: 'error' });
    }
  };

  const handleRequestAction = async (requestId, action, senderId, senderUsername) => {
    try {
      const requestDocRef = doc(db, `artifacts/${appId}/public/data/friendRequests/${requestId}`);
      await updateDoc(requestDocRef, { status: action });

      if (action === 'accepted') {
        // 1. Add relationship to both users' private 'friends' collection
        const userFriendDocRef = doc(getUserFriendsCollection(currentUserId), senderId);
        const senderFriendDocRef = doc(getUserFriendsCollection(senderId), currentUserId);

        await setDoc(userFriendDocRef, { uid: senderId, username: senderUsername });
        await setDoc(senderFriendDocRef, { uid: currentUserId, username: auth.currentUser.displayName });

        setToastMessage({ message: `Accepted friend request from ${senderUsername}.`, type: 'success' });

        // 2. Create a new DM group (a 'group' with only 2 members)
        const newGroupRef = await addDoc(getPublicCollection('groups'), {
            name: `${auth.currentUser.displayName} & ${senderUsername}`,
            type: 'dm',
            members: [currentUserId, senderId],
            ownerId: currentUserId,
            createdAt: serverTimestamp(),
        });

        // 3. Add initial welcome message
        await addDoc(collection(newGroupRef, 'messages'), {
            senderId: 'SYSTEM',
            senderUsername: 'System',
            content: `DM chat created between ${auth.currentUser.displayName} and ${senderUsername}. Say hello!`,
            timestamp: serverTimestamp(),
        });


      } else {
        setToastMessage({ message: `Declined request from ${senderUsername}.`, type: 'info' });
      }

    } catch (error) {
      console.error('Error handling request action:', error);
      setToastMessage({ message: `Failed to ${action} request.`, type: 'error' });
    }
  };

  // Helper to check if a user is already a friend or has a pending request
  const getRequestStatus = (uid) => {
    if (friends.some(f => f.uid === uid)) return 'Friend';
    if (pendingSentRequests.some(r => r.receiverId === uid)) return 'Pending';
    return 'Add Friend';
  };

  return (
    <div className="flex h-full flex-col bg-gray-700 p-6 text-white">
      <h1 className="mb-6 border-b border-gray-600 pb-3 text-2xl font-bold">Friend Management</h1>

      {/* Add Friend Section */}
      <div className="mb-8 rounded-lg bg-gray-600 p-4 shadow-lg">
        <h2 className="mb-3 text-xl font-semibold">Add Friend</h2>
        <input
          type="text"
          placeholder="Search users by username..."
          value={usernameQuery}
          onChange={(e) => setUsernameQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-500 bg-gray-700 p-2 text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-indigo-500"
        />
        <div className="mt-3 space-y-2">
          {searchResults.map((user) => (
            <div key={user.uid} className="flex items-center justify-between rounded-md bg-gray-700 p-3">
              <span className="font-medium">{user.username}</span>
              {user.uid === currentUserId ? (
                <span className="text-xs text-gray-400"> (You) </span>
              ) : (
                <button
                  onClick={() => sendFriendRequest(user.uid, user.username)}
                  className={`rounded px-3 py-1 text-sm font-semibold transition duration-150 ${
                    getRequestStatus(user.uid) === 'Add Friend'
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : 'bg-gray-500 cursor-not-allowed'
                  }`}
                  disabled={getRequestStatus(user.uid) !== 'Add Friend'}
                >
                  {getRequestStatus(user.uid)}
                </button>
              )}
            </div>
          ))}
          {usernameQuery && searchResults.length === 0 && (
            <div className="text-center text-sm text-gray-400 pt-2">No users found matching "{usernameQuery}". Try searching for one of the mock users (e.g., AlphaUser).</div>
          )}
        </div>
      </div>

      {/* Pending Requests Section */}
      <div className="flex-grow overflow-y-auto">
        <h2 className="mb-4 text-xl font-semibold">Pending Received Requests ({pendingReceivedRequests.length})</h2>
        <div className="space-y-3">
          {pendingReceivedRequests.length > 0 ? (
            pendingReceivedRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded-lg bg-gray-600 p-4 shadow-md">
                <span className="font-medium">{request.senderUsername} wants to be friends.</span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleRequestAction(request.id, 'accepted', request.senderId, request.senderUsername)}
                    className="rounded bg-green-600 px-3 py-1 text-sm font-semibold transition duration-150 hover:bg-green-700"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRequestAction(request.id, 'declined', request.senderId, request.senderUsername)}
                    className="rounded bg-red-600 px-3 py-1 text-sm font-semibold transition duration-150 hover:bg-red-700"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-400">No incoming friend requests.</p>
          )}
        </div>

        <h2 className="mb-4 mt-6 text-xl font-semibold">Pending Sent Requests ({pendingSentRequests.length})</h2>
        <div className="space-y-3">
          {pendingSentRequests.length > 0 ? (
            pendingSentRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded-lg bg-gray-600 p-4 shadow-md">
                <span className="font-medium">Request sent to {request.receiverUsername}</span>
                <span className="text-sm text-gray-400">Pending</span>
              </div>
            ))
          ) : (
            <p className="text-gray-400">No outgoing friend requests.</p>
          )}
        </div>
      </div>
    </div>
  );
};


/**
 * Component to search and select GIFs from Tenor.
 */
const GifPicker = ({ onGifSelect, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const pickerRef = React.useRef(null);

    const fetchGifs = useCallback(async (query = '') => {
        if (!TENOR_API_KEY) {
            setError('Tenor API Key is missing.');
            return;
        }

        setLoading(true);
        setError(null);
        const url = query ? TENOR_SEARCH_URL(query) : TENOR_TRENDING_URL;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to fetch GIFs from Tenor.');
            }
            const data = await response.json();
            // Tenor stores the results in the 'results' array
            setGifs(data.results || []);
        } catch (err) {
            console.error('Tenor Fetch Error:', err);
            setError('Could not load GIFs. Check API key or network.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load/Search trigger (Debounced)
    useEffect(() => {
        const handler = setTimeout(() => {
            fetchGifs(searchTerm);
        }, 300); // 300ms debounce

        return () => {
            clearTimeout(handler);
        };
    }, [fetchGifs, searchTerm]);

    // Close on outside click (or by pressing ESC)
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target)) {
                onClose();
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    const handleSelect = (gif) => {
        // Use the full GIF URL from Tenor's media formats
        const gifUrl = gif.media_formats.gif?.url;
        if (gifUrl) {
            onGifSelect(gifUrl); 
        } else {
            setError("Could not find a valid GIF URL for this selection.");
        }
        onClose();
    };

    return (
        <div ref={pickerRef} className="absolute bottom-full mb-2 w-full max-w-lg right-0 md:right-4 bg-gray-900 rounded-xl shadow-2xl p-4 border border-gray-700">
            <input
                type="text"
                placeholder="Search GIFs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 p-2 text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
            />

            {error && <div className="p-2 text-red-400 text-center bg-gray-800 rounded">{error}</div>}
            {loading && !error && <div className="text-center text-indigo-400">Loading...</div>}

            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                {gifs.map(gif => {
                    // Use a smaller, faster loading format (like tinygif) for the preview grid
                    const previewUrl = gif.media_formats.tinygif?.url || gif.media_formats.gif?.url;

                    if (!previewUrl) return null;

                    return (
                        <div
                            key={gif.id}
                            onClick={() => handleSelect(gif)}
                            className="cursor-pointer rounded-lg overflow-hidden border-2 border-transparent hover:border-indigo-500 transition duration-150 relative aspect-square"
                            title={gif.content_description || 'GIF'}
                        >
                            {/* Optimization: Added loading="lazy" */}
                            <img
                                src={previewUrl} 
                                alt={gif.content_description || 'GIF'}
                                className="w-full h-full object-cover"
                                loading="lazy" 
                                onError={(e) => e.currentTarget.src = "https://placehold.co/100x100/374151/FFFFFF?text=GIF+Error"}
                            />
                        </div>
                    );
                })}
            </div>
            {/* Custom scrollbar style for the GIF grid */}
            <style>{`
              .custom-scrollbar::-webkit-scrollbar { width: 8px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: #374151; /* gray-700 */ }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: #6366f1; /* indigo-600 */ border-radius: 4px; }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4f46e5; /* indigo-700 */ }
            `}</style>
        </div>
    );
};

/**
 * Memoized component for rendering a single message. 
 * This prevents all messages from re-rendering when only the input box state changes.
 */
const MessageItem = React.memo(({ msg, currentUserId }) => {
    const isSystemMessage = msg.senderId === 'SYSTEM';

    return (
        <div
            className={`flex ${isSystemMessage ? 'justify-center' : (msg.senderId === currentUserId ? 'justify-end' : 'justify-start')}`}
        >
            <div className={`p-3 rounded-xl max-w-lg shadow-md ${
                isSystemMessage
                    ? 'bg-gray-600 text-gray-300 text-sm italic'
                    : msg.senderId === currentUserId
                        ? 'bg-indigo-600 text-white self-end'
                        : 'bg-gray-600 text-white self-start'
            }`}>
                {!isSystemMessage && (
                    <p className={`font-semibold text-sm mb-1 ${msg.senderId === currentUserId ? 'text-indigo-200' : 'text-blue-300'}`}>
                        {msg.senderUsername || 'Anonymous User'}
                    </p>
                )}
                
                {/* Render Content based on type */}
                {msg.type === 'gif' ? (
                    // Optimization: Added loading="lazy" for GIF messages
                    <img
                        src={msg.content}
                        alt="Sent GIF"
                        className="max-w-full sm:max-w-xs rounded-lg shadow-lg border-2 border-gray-500"
                        loading="lazy" 
                        onError={(e) => e.currentTarget.src = "https://placehold.co/200x150/000000/FFFFFF?text=GIF+Failed"}
                    />
                ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                )}

                <p className="text-right text-xs mt-1 opacity-70">
                    {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString() : '...'}
                </p>
            </div>
        </div>
    );
});


/**
 * Displays the current chat (DM or Group)
 */
const ChatArea = ({ currentUserId, selectedGroup, messages, currentUsername, setToastMessage }) => {
    const [messageContent, setMessageContent] = useState('');
    const [isGifPickerOpen, setIsGifPickerOpen] = useState(false); // State for GIF picker
    const messagesEndRef = React.useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Scroll when messages change
    useEffect(scrollToBottom, [messages]);

    // Use useCallback to memoize the message sending function
    const handleSendMessage = useCallback(async (e) => {
        e.preventDefault();
        if (!messageContent.trim() || !selectedGroup.id) return;

        try {
            const messagesCollectionRef = collection(db, `artifacts/${appId}/public/data/groups/${selectedGroup.id}/messages`);
            await addDoc(messagesCollectionRef, {
                senderId: currentUserId,
                senderUsername: currentUsername,
                content: messageContent.trim(),
                type: 'text', // Explicitly set message type
                timestamp: serverTimestamp(),
            });
            setMessageContent('');
        } catch (error) {
            console.error("Error sending message:", error);
            setToastMessage({ message: 'Failed to send message.', type: 'error' });
        }
    }, [messageContent, selectedGroup, currentUserId, currentUsername, setToastMessage]);

    // Use useCallback to memoize the GIF selection function
    const handleGifSelect = useCallback(async (gifUrl) => {
        try {
            const messagesCollectionRef = collection(db, `artifacts/${appId}/public/data/groups/${selectedGroup.id}/messages`);
            await addDoc(messagesCollectionRef, {
                senderId: currentUserId,
                senderUsername: currentUsername,
                content: gifUrl, // Store the URL
                type: 'gif', // Add type field
                timestamp: serverTimestamp(),
            });
            setToastMessage({ message: 'GIF sent!', type: 'success' });
        } catch (error) {
            console.error("Error sending GIF message:", error);
            setToastMessage({ message: 'Failed to send GIF.', type: 'error' });
        }
        setIsGifPickerOpen(false); // Close picker after selection
    }, [selectedGroup, currentUserId, currentUsername, setToastMessage]);


    if (!selectedGroup) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-700 text-gray-400">
                <p className="text-xl">Select a group or a friend to start chatting.</p>
                <p className="text-sm mt-2">Use the sidebar to navigate.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-700">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-600 bg-gray-800 shadow-md">
                <h2 className="text-xl font-bold text-white">
                    {selectedGroup.type === 'dm' ? `DM with ${selectedGroup.name.replace(`${currentUsername} & `, '').replace(` & ${currentUsername}`, '')}` : selectedGroup.name}
                </h2>
                <p className="text-sm text-gray-400">Group ID: <span className="font-mono text-xs">{selectedGroup.id}</span></p>
            </div>

            {/* Message Area */}
            {/* Rendering MessageItem instead of inline logic for performance gain */}
            <div className="flex-grow overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-500 pt-8">
                        No messages yet. Say hello!
                    </div>
                ) : (
                    messages.map((msg, index) => (
                        <MessageItem
                            key={msg.id || index} // Use msg.id for stability
                            msg={msg}
                            currentUserId={currentUserId}
                        />
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Message Input with GIF Picker */}
            <div className="p-4 border-t border-gray-600 bg-gray-800 relative">
                {isGifPickerOpen && (
                    <GifPicker
                        onGifSelect={handleGifSelect}
                        onClose={() => setIsGifPickerOpen(false)}
                    />
                )}
                <form onSubmit={handleSendMessage} className="flex space-x-3">
                    <button
                        type="button"
                        onClick={() => setIsGifPickerOpen(prev => !prev)}
                        className={`rounded-lg p-3 font-semibold transition duration-200 ${isGifPickerOpen ? 'bg-pink-700 text-white' : 'bg-pink-600 text-white hover:bg-pink-700'}`}
                        title="Toggle GIF Picker"
                    >
                         {/* GIF Icon */}
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-12 5h4m-4 0v-5m-5 5H3a2 2 0 01-2-2v-5a2 2 0 012-2h18a2 2 0 012 2v5a2 2 0 01-2 2h-4"></path></svg>
                    </button>
                    <input
                        type="text"
                        value={messageContent}
                        onChange={(e) => setMessageContent(e.target.value)}
                        placeholder={`Message #${selectedGroup.name}...`}
                        className="flex-grow rounded-lg border border-gray-600 bg-gray-700 p-3 text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                        type="submit"
                        className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white transition duration-200 hover:bg-indigo-700 disabled:opacity-50"
                        disabled={!messageContent.trim()}
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
};


/**
 * Sidebar for navigation and user information
 */
const Sidebar = ({
  currentUserId,
  currentUsername,
  onViewChange,
  friends,
  groups,
  onGroupSelect,
  selectedGroup,
  setToastMessage,
}) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [isAddingGroup, setIsAddingGroup] = useState(false);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      setToastMessage({ message: 'Group name cannot be empty.', type: 'error' });
      return;
    }
    if (!db || !currentUserId) return;

    try {
      await addDoc(getPublicCollection('groups'), {
        name: newGroupName.trim(),
        type: 'group',
        ownerId: currentUserId,
        members: [currentUserId], // Owner is the first member
        createdAt: serverTimestamp(),
      });
      setToastMessage({ message: `Group '${newGroupName.trim()}' created!`, type: 'success' });
      setNewGroupName('');
      setIsAddingGroup(false);
    } catch (error) {
      console.error('Error creating group:', error);
      setToastMessage({ message: 'Failed to create group.', type: 'error' });
    }
  };

  const handleLogout = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error logging out:", error);
    }
  };

  const GroupItem = ({ group }) => {
    const isActive = selectedGroup?.id === group.id;

    // For DMs, show the other user's name
    const displayGroupName = useMemo(() => {
        if (group.type === 'dm') {
            return group.name.replace(`${currentUsername} & `, '').replace(` & ${currentUsername}`, '');
        }
        return group.name;
    }, [group, currentUsername]);

    return (
      <button
        onClick={() => onGroupSelect(group)}
        className={`w-full text-left p-2 rounded-lg transition duration-150 ${
          isActive ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'
        }`}
      >
        {group.type === 'dm' ? (
            <span className="flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                {displayGroupName}
            </span>
        ) : (
            <span className="flex items-center">
                <span className="text-xl font-extrabold mr-2">#</span>
                {displayGroupName}
            </span>
        )}

      </button>
    );
  };

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900 p-4 text-white shadow-xl">
      {/* App Header */}
      <div className="mb-4 border-b border-gray-700 pb-4">
        <h1 className="text-2xl font-extrabold text-indigo-400">ProChat</h1>
      </div>

      {/* Navigation */}
      <div className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold uppercase text-gray-400">General</h2>
        <button
          onClick={() => onViewChange('Friends')}
          className={`w-full text-left p-2 rounded-lg transition duration-150 ${selectedGroup === 'Friends' ? 'bg-indigo-600' : 'hover:bg-gray-800'}`}
        >
          <span className="flex items-center font-medium">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20v-2c0-.656-.126-1.283-.356-1.857M18 12v12a2 2 0 01-2 2H8a2 2 0 01-2-2V12m12 0h-4m2 0H6"></path></svg>
            Friend Requests
          </span>
        </button>
      </div>

      {/* Direct Messages (DMs) */}
      <div className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold uppercase text-gray-400">Direct Messages ({groups.filter(g => g.type === 'dm').length})</h2>
        {groups.filter(g => g.type === 'dm').map(dm => (
          <GroupItem key={dm.id} group={dm} />
        ))}
      </div>

      {/* Group Channels */}
      <div className="flex-grow overflow-y-auto space-y-2">
        <h2 className="text-sm font-semibold uppercase text-gray-400 flex justify-between items-center">
          Group Channels ({groups.filter(g => g.type === 'group').length})
          <button onClick={() => setIsAddingGroup(true)} className="text-lg hover:text-indigo-400 transition duration-150">+</button>
        </h2>
        {isAddingGroup && (
            <div className="p-2 bg-gray-800 rounded-lg flex flex-col space-y-2">
                <input
                    type="text"
                    placeholder="New Group Name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full p-1 rounded bg-gray-700 text-sm border border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <div className="flex justify-end space-x-2">
                    <button onClick={() => setIsAddingGroup(false)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                    <button onClick={handleCreateGroup} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded px-2 py-1">Create</button>
                </div>
            </div>
        )}
        {groups.filter(g => g.type === 'group').map(group => (
          <GroupItem key={group.id} group={group} />
        ))}
      </div>


      {/* User Info and Logout */}
      <div className="mt-4 border-t border-gray-700 pt-4">
        <div className="flex items-center justify-between p-2 rounded-lg bg-gray-800">
          <div className="truncate">
            <p className="font-semibold text-sm truncate" title={currentUsername}>{currentUsername || 'Loading...'}</p>
            <p className="text-xs text-gray-400 font-mono break-all" title={currentUserId}>ID: {currentUserId}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-red-400 hover:text-red-500 transition duration-150"
            title="Log Out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      </div>
    </div>
  );
};


// --- Main Application Component ---
export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUsername, setCurrentUsername] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const [currentView, setCurrentView] = useState('Friends'); // 'Friends' or 'Chat'
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState([]);

  // Using a mock list of users for search because querying all user profiles is blocked by security rules.
  // This adheres to the rule of avoiding unauthorized queries.
  const allUsers = useMemo(() => {
      const baseUsers = [
          { uid: 'user_a_id', username: 'AlphaUser', email: 'a@a.com' },
          { uid: 'user_b_id', username: 'BetaCoder', email: 'b@b.com' },
          { uid: 'user_c_id', username: 'CharlieDev', email: 'c@c.com' },
          { uid: 'user_d_id', username: 'DeltaTester', email: 'd@d.com' },
      ];
      // Add the current user to the list if logged in
      if (currentUserId && currentUsername) {
          // If the user is already in the mock list (e.g., during development), update their display name
          const existingUser = baseUsers.find(u => u.uid === currentUserId);
          if (existingUser) {
              existingUser.username = currentUsername;
          } else {
             baseUsers.push({ uid: currentUserId, username: currentUsername });
          }
      }
      return baseUsers;
  }, [currentUserId, currentUsername]);


  // --- 1. Firebase Initialization and Authentication ---
  useEffect(() => {
    if (!auth || !db) {
        setAuthError("Firebase services failed to initialize. Check configuration.");
        return;
    }

    // Attempt to sign in with custom token first
    const signIn = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          // Fallback to anonymous sign-in if no token is available
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Initial Auth Failed. Showing Login/Register.", e);
        // Clear any half-baked auth state
        await signOut(auth).catch(() => {});
        setAuthReady(true);
      }
    };

    signIn();

    // Set up auth state listener
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUserId(user.uid);
        setCurrentUsername(user.displayName || 'Anonymous User');

        // Check if user profile exists, if not, wait for user to register/login
        if (user.isAnonymous || !user.displayName) {
            setAuthReady(true);
            return; // Stay in AuthView until proper registration
        }

        // Fetch user profile data to ensure local state is accurate
        const profileDoc = await getDoc(getUserProfileDoc(user.uid));
        if (profileDoc.exists()) {
            setCurrentUsername(profileDoc.data().username);
        } else {
            // User signed in but profile wasn't set (e.g., first time login after anonymous)
            // This is handled in AuthView during registration, but good practice to ensure.
            await setDoc(getUserProfileDoc(user.uid), {
                username: user.displayName,
                uid: user.uid,
                email: user.email,
                status: 'online',
            });
        }

      } else {
        setCurrentUserId(null);
        setCurrentUsername(null);
        setGroups([]);
        setFriends([]);
        setSelectedGroup(null);
      }
      setAuthReady(true);
    });

    return () => unsubscribeAuth();
  }, []); // Run only once on mount

  // --- 2. Data Fetching (after Auth is confirmed and userId is set) ---

  // B. Fetch Friends List (Private)
  useEffect(() => {
    if (!authReady || !currentUserId || !db) return;

    const friendsQ = getUserFriendsCollection(currentUserId);
    const unsubscribe = onSnapshot(friendsQ, (snapshot) => {
      setFriends(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
        console.error("Error fetching friends:", error);
    });

    return () => unsubscribe();
  }, [authReady, currentUserId]);


  // C. Fetch Groups/DMs (Public)
  useEffect(() => {
    if (!authReady || !currentUserId || !db) return;

    // FIX: Removed orderBy from query to prevent index error
    const groupsQ = query(
      getPublicCollection('groups'),
      where('members', 'array-contains', currentUserId)
    );

    const unsubscribe = onSnapshot(groupsQ, (snapshot) => {
      // FIX: Perform client-side sorting by createdAt timestamp
      const fetchedGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      fetchedGroups.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA; // Descending sort (newest first)
      });

      setGroups(fetchedGroups);
    }, (error) => {
        console.error("Error fetching groups:", error);
    });

    return () => unsubscribe();
  }, [authReady, currentUserId]);


  // D. Fetch Messages for the Selected Group
  useEffect(() => {
    if (!db || !selectedGroup || currentView !== 'Chat') {
      setMessages([]);
      return;
    }

    const messagesQ = query(
      collection(db, `artifacts/${appId}/public/data/groups/${selectedGroup.id}/messages`),
      orderBy('timestamp', 'asc'),
      limit(50) // Limit to last 50 messages
    );

    const unsubscribe = onSnapshot(messagesQ, (snapshot) => {
      // Map data and ensure 'id' is present for React keys
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, type: doc.data().type || 'text', ...doc.data() })));
    }, (error) => {
        console.error("Error fetching messages:", error);
        setToastMessage({ message: 'Failed to load messages.', type: 'error' });
    });

    return () => unsubscribe();
  }, [selectedGroup, currentView]);


  const handleGroupSelect = (group) => {
    setSelectedGroup(group);
    setCurrentView('Chat');
  };

  const handleViewChange = (viewName) => {
      setSelectedGroup(null);
      setCurrentView(viewName);
  };

  // --- Render Logic ---

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="text-xl text-white">
          <svg className="animate-spin h-5 w-5 mr-3 inline text-indigo-400" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" className="opacity-25"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          Loading Application...
        </div>
      </div>
    );
  }

  if (!currentUserId || !currentUsername) {
    return (
      <>
        <AuthView setUserId={setCurrentUserId} setUsername={setCurrentUsername} setAuthError={setAuthError} setAuthReady={setAuthReady} />
        {authError && <Toast message={authError} type="error" onClose={() => setAuthError(null)} />}
      </>
    );
  }

  // Main Chat Layout
  return (
    <div className="flex h-screen w-full font-sans bg-gray-800">
      <Sidebar
        currentUserId={currentUserId}
        currentUsername={currentUsername}
        onViewChange={handleViewChange}
        friends={friends}
        groups={groups}
        onGroupSelect={handleGroupSelect}
        selectedGroup={selectedGroup}
        setToastMessage={setToastMessage}
      />
      <main className="flex-1">
        {currentView === 'Friends' ? (
          <FriendRequestsView
            currentUserId={currentUserId}
            friends={friends}
            allUsers={allUsers}
            setToastMessage={setToastMessage}
          />
        ) : (
          <ChatArea
            currentUserId={currentUserId}
            selectedGroup={selectedGroup}
            messages={messages}
            currentUsername={currentUsername}
            setToastMessage={setToastMessage}
          />
        )}
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <Toast
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
        />
      )}
    </div>
  );
}
