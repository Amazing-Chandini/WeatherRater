// Weather Rater App with Cloud Storage (Firebase) and User Profiles

// Import Firebase Firestore functions (available after Firebase script loads)
let collection, addDoc, query, where, getDocs, onSnapshot, deleteDoc, doc, updateDoc, orderBy;

// Wait for Firebase to load
setTimeout(async () => {
    if (window.firebaseEnabled && window.db) {
        const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        collection = firestoreModule.collection;
        addDoc = firestoreModule.addDoc;
        query = firestoreModule.query;
        where = firestoreModule.where;
        getDocs = firestoreModule.getDocs;
        onSnapshot = firestoreModule.onSnapshot;
        deleteDoc = firestoreModule.deleteDoc;
        doc = firestoreModule.doc;
        updateDoc = firestoreModule.updateDoc;
        orderBy = firestoreModule.orderBy;
    }
}, 100);

// Simple password hashing (for demo purposes - in production, use proper authentication)
async function simpleHash(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Input sanitization to prevent XSS and invalid data
function sanitizeInput(input, maxLength = 20) {
    if (!input) return '';
    return input
        .trim()
        .replace(/[<>'"]/g, '')  // Remove dangerous characters
        .replace(/\s+/g, ' ')     // Normalize whitespace
        .substring(0, maxLength); // Limit length
}

// Format Firebase error messages for users
function getFriendlyErrorMessage(error) {
    if (!error) return 'An unknown error occurred';

    const errorCode = error.code || '';

    if (errorCode.includes('permission-denied')) {
        return 'Permission denied. Please check your connection and try again.';
    }
    if (errorCode.includes('unavailable')) {
        return 'Service temporarily unavailable. Please try again in a moment.';
    }
    if (errorCode.includes('network')) {
        return 'Network error. Please check your internet connection.';
    }
    if (errorCode.includes('unauthenticated')) {
        return 'Authentication error. Please log in again.';
    }

    return 'An error occurred. Please try again.';
}

class WeatherRater {
    constructor() {
        this.currentUser = this.loadCurrentUser();
        this.ratings = [];
        this.friends = [];
        this.friendsRatings = [];
        this.selectedFriend = null;
        this.selectedFriendRatings = [];
        this.incomingRequests = [];
        this.sentRequests = [];
        this.map = null;
        this.friendsMap = null;
        this.fullscreenMap = null;
        this.markers = [];
        this.friendsMarkers = [];
        this.fullscreenMarkers = [];
        this.currentWeather = null;
        this.currentLocation = null;
        this.useFirebase = false;
        this.shareRatings = true;
        this.currentTab = 'my-ratings';
        this.isAuthenticated = false;
        this.manageFriendsMode = false;
        this.fullscreenMode = false;

        // Rate limiting
        this.lastRatingTime = null;
        this.recentFriendRequests = [];

        // Check Firebase availability
        setTimeout(() => {
            this.checkFirebaseStatus();
            this.init();
        }, 200);
    }

    async checkFirebaseStatus() {
        if (window.firebaseEnabled && window.db) {
            this.useFirebase = true;
            console.log('✅ Cloud storage enabled (Firebase)');
        } else {
            this.useFirebase = false;
            console.log('⚠️ Using localStorage (not synced across devices)');
        }
    }

    async init() {
        // Check if user has a saved session
        const savedSession = localStorage.getItem('userSession');
        if (savedSession) {
            const session = JSON.parse(savedSession);
            this.currentUser = session.username;
            this.isAuthenticated = true;
            await this.loadRatings();
            await this.loadUserSettings();
            await this.loadFriends();
            await this.loadFriendRequests();
            this.showMainApp();
        } else {
            this.showProfileSetup();
        }
    }

    showProfileSetup() {
        document.getElementById('user-profile-section').style.display = 'block';
        document.getElementById('main-app').style.display = 'none';

        // Show login form by default
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('signup-form').style.display = 'none';

        // Toggle between login and signup
        document.getElementById('show-login').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('signup-form').style.display = 'none';
            document.getElementById('login-form').style.display = 'block';
        });

        document.getElementById('show-signup').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('signup-form').style.display = 'block';
        });

        // Signup
        document.getElementById('signup-btn').addEventListener('click', () => this.signup());
        document.getElementById('signup-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.signup();
        });

        // Login
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('login-password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
    }

    async signup() {
        const usernameInput = document.getElementById('signup-username').value;
        const password = document.getElementById('signup-password').value;
        const btn = document.getElementById('signup-btn');

        // Sanitize input
        const username = sanitizeInput(usernameInput, 20);

        if (!username) {
            alert('Please enter a valid username (letters, numbers, and underscores only)');
            return;
        }

        if (username.length < 3) {
            alert('Username must be at least 3 characters');
            return;
        }

        if (password.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }

        // Loading state
        btn.disabled = true;
        btn.textContent = 'Creating Account...';

        try {
            // Check if username already exists
            if (this.useFirebase && window.db && collection) {
                const userQuery = query(collection(window.db, 'users'), where('username', '==', username));
                const userDocs = await getDocs(userQuery);

                if (!userDocs.empty) {
                    alert('Username already exists. Please choose another or log in.');
                    return;
                }

                // Create new user
                const passwordHash = await simpleHash(password);
                await addDoc(collection(window.db, 'users'), {
                    username: username,
                    passwordHash: passwordHash,
                    friends: [],
                    shareRatings: true,
                    createdAt: new Date().toISOString()
                });

                this.setUserSession(username);
                this.showMessage('Account created successfully!', 'success');
                await this.loadRatings();
                this.showMainApp();
            } else {
                // localStorage fallback
                const users = JSON.parse(localStorage.getItem('users') || '{}');
                if (users[username]) {
                    alert('Username already exists. Please choose another.');
                    return;
                }

                const passwordHash = await simpleHash(password);
                users[username] = {
                    passwordHash: passwordHash,
                    createdAt: new Date().toISOString()
                };
                localStorage.setItem('users', JSON.stringify(users));

                this.setUserSession(username);
                this.showMessage('Account created successfully!', 'success');
                await this.loadRatings();
                this.showMainApp();
            }
        } catch (error) {
            console.error('Signup error:', error);
            alert(getFriendlyErrorMessage(error));
        } finally {
            btn.disabled = false;
            btn.textContent = 'Create Account';
        }
    }

    async login() {
        const usernameInput = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const btn = document.getElementById('login-btn');

        // Sanitize input
        const username = sanitizeInput(usernameInput, 20);

        if (!username || !password) {
            alert('Please enter both username and password');
            return;
        }

        // Loading state
        btn.disabled = true;
        btn.textContent = 'Logging In...';

        try {
            if (this.useFirebase && window.db && collection) {
                const userQuery = query(collection(window.db, 'users'), where('username', '==', username));
                const userDocs = await getDocs(userQuery);

                if (userDocs.empty) {
                    alert('User not found. Please check your username or sign up.');
                    return;
                }

                const userData = userDocs.docs[0].data();
                const passwordHash = await simpleHash(password);

                if (userData.passwordHash !== passwordHash) {
                    alert('Incorrect password. Please try again.');
                    return;
                }

                this.setUserSession(username);
                this.showMessage('Welcome back!', 'success');
                await this.loadRatings();
                await this.loadUserSettings();
                await this.loadFriends();
                await this.loadFriendRequests();
                this.showMainApp();
            } else {
                // localStorage fallback
                const users = JSON.parse(localStorage.getItem('users') || '{}');
                if (!users[username]) {
                    alert('User not found. Please check your username or sign up.');
                    return;
                }

                const passwordHash = await simpleHash(password);
                if (users[username].passwordHash !== passwordHash) {
                    alert('Incorrect password. Please try again.');
                    return;
                }

                this.setUserSession(username);
                this.showMessage('Welcome back!', 'success');
                await this.loadRatings();
                this.showMainApp();
            }
        } catch (error) {
            console.error('Login error:', error);
            alert(getFriendlyErrorMessage(error));
        } finally {
            btn.disabled = false;
            btn.textContent = 'Log In';
        }
    }

    setUserSession(username) {
        this.currentUser = username;
        this.isAuthenticated = true;
        localStorage.setItem('userSession', JSON.stringify({
            username: username,
            loginTime: new Date().toISOString()
        }));
    }

    logout() {
        localStorage.removeItem('userSession');
        this.currentUser = null;
        this.isAuthenticated = false;
        location.reload();
    }

    showMainApp() {
        document.getElementById('user-profile-section').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';

        const storageType = this.useFirebase ? '☁️ Cloud' : '💾 Local';
        document.getElementById('current-user').textContent = `👤 ${this.currentUser} (${storageType})`;

        // Set up privacy toggle
        document.getElementById('share-ratings').checked = this.shareRatings;

        this.setupEventListeners();
        this.initMap();
        this.initFriendsMap();
        this.displayStats();
        this.displayRatingsOnMap();
        this.displayRatingHistory();
        this.displayFriendsList();
        this.getCurrentLocationAndWeather();

        if (this.useFirebase) {
            this.setupRealtimeSync();
        }
    }

    setupEventListeners() {
        const buttons = document.querySelectorAll('.rating-btn');
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.handleRating(parseInt(e.target.dataset.rating));
            });
        });

        document.getElementById('change-user-btn').addEventListener('click', () => {
            if (confirm('Log out? Your data is saved.')) {
                this.logout();
            }
        });

        // Friend management
        document.getElementById('add-friend-btn').addEventListener('click', () => {
            this.addFriend();
        });

        document.getElementById('friend-username').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addFriend();
            }
        });

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Privacy toggle
        document.getElementById('share-ratings').addEventListener('change', (e) => {
            this.togglePrivacy(e.target.checked);
        });

        // Friends settings dropdown
        const settingsBtn = document.getElementById('friends-settings-btn');
        const settingsDropdown = document.getElementById('friends-settings-dropdown');
        const manageFriendsBtn = document.getElementById('manage-friends-btn');

        if (settingsBtn && settingsDropdown && manageFriendsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = settingsDropdown.style.display === 'block';
                settingsDropdown.style.display = isVisible ? 'none' : 'block';
            });

            manageFriendsBtn.addEventListener('click', () => {
                this.toggleManageFriendsMode();
                settingsDropdown.style.display = 'none';
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!settingsBtn.contains(e.target) && !settingsDropdown.contains(e.target)) {
                    settingsDropdown.style.display = 'none';
                }
            });
        }

        // Fullscreen mode toggle
        document.getElementById('enter-fullscreen-btn').addEventListener('click', () => {
            this.enterFullscreenMode();
        });

        document.getElementById('fullscreen-toggle-btn').addEventListener('click', () => {
            this.exitFullscreenMode();
        });

        // Fullscreen rating buttons
        document.querySelectorAll('.fullscreen-rating-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                this.handleRating(parseInt(e.target.dataset.rating));
            });
        });
    }

    setUser(username) {
        this.currentUser = username;
        localStorage.setItem('currentUser', username);
    }

    loadCurrentUser() {
        return localStorage.getItem('currentUser');
    }

    async setupRealtimeSync() {
        if (!this.useFirebase || !window.db) return;

        try {
            const q = query(
                collection(window.db, 'ratings'),
                where('user', '==', this.currentUser)
            );

            onSnapshot(q, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const newRating = { id: change.doc.id, ...change.doc.data() };
                        const exists = this.ratings.find(r => r.id === newRating.id);
                        if (!exists) {
                            this.ratings.push(newRating);
                            this.displayStats();
                            this.displayRatingHistory();
                            this.addMarkerToMap(newRating);
                        }
                    }
                });
            });

            console.log('✅ Real-time sync enabled');
        } catch (error) {
            console.error('Real-time sync error:', error);
        }
    }

    getCurrentLocationAndWeather() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    };
                    this.fetchWeatherData(position.coords.latitude, position.coords.longitude);
                },
                (error) => {
                    console.error('Geolocation error:', error);
                    this.showWeatherError('Could not get your location. Using default weather display.');
                }
            );
        } else {
            this.showWeatherError('Geolocation not supported by your browser.');
        }
    }

    async fetchWeatherData(lat, lon) {
        try {
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,dew_point_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`
            );

            if (!response.ok) throw new Error('Weather API error');

            const data = await response.json();
            this.currentWeather = {
                temperature: data.current.temperature_2m,
                humidity: data.current.relative_humidity_2m,
                precipitation: data.current.precipitation,
                wind: data.current.wind_speed_10m,
                dewPoint: data.current.dew_point_2m,
                timeOfDay: this.getTimeOfDay()
            };

            this.displayWeather();
        } catch (error) {
            console.error('Weather fetch error:', error);
            this.currentWeather = this.getSimulatedWeather();
            this.displayWeather();
        }
    }

    getSimulatedWeather() {
        return {
            temperature: Math.round(60 + Math.random() * 30),
            humidity: Math.round(40 + Math.random() * 40),
            precipitation: Math.round(Math.random() * 10) / 10,
            wind: Math.round(3 + Math.random() * 12),
            dewPoint: Math.round(50 + Math.random() * 20),
            timeOfDay: this.getTimeOfDay()
        };
    }

    getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'Morning';
        if (hour >= 12 && hour < 17) return 'Afternoon';
        if (hour >= 17 && hour < 21) return 'Evening';
        return 'Night';
    }

    displayWeather() {
        const weatherEl = document.getElementById('current-weather');

        if (!this.currentWeather) {
            weatherEl.innerHTML = '<div class="weather-loading">Weather data unavailable</div>';
            return;
        }

        weatherEl.innerHTML = `
            <div class="weather-data">
                <div class="weather-item">
                    <div class="weather-label">Temperature</div>
                    <div class="weather-value">${this.currentWeather.temperature}°F</div>
                </div>
                <div class="weather-item">
                    <div class="weather-label">Humidity</div>
                    <div class="weather-value">${this.currentWeather.humidity}%</div>
                </div>
                <div class="weather-item">
                    <div class="weather-label">Wind</div>
                    <div class="weather-value">${this.currentWeather.wind} mph</div>
                </div>
                <div class="weather-item">
                    <div class="weather-label">Precipitation</div>
                    <div class="weather-value">${this.currentWeather.precipitation}"</div>
                </div>
                <div class="weather-item">
                    <div class="weather-label">Dew Point</div>
                    <div class="weather-value">${this.currentWeather.dewPoint}°F</div>
                </div>
                <div class="weather-item">
                    <div class="weather-label">Time</div>
                    <div class="weather-value">${this.currentWeather.timeOfDay}</div>
                </div>
            </div>
        `;
    }

    showWeatherError(message) {
        const weatherEl = document.getElementById('current-weather');
        weatherEl.innerHTML = `<div class="weather-loading">${message}</div>`;
    }

    handleRating(overallRating) {
        // Rate limiting: 1 rating per 5 minutes
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (this.lastRatingTime && (now - this.lastRatingTime) < fiveMinutes) {
            const timeLeft = Math.ceil((fiveMinutes - (now - this.lastRatingTime)) / 60000);
            this.showMessage(`Please wait ${timeLeft} more minute${timeLeft > 1 ? 's' : ''} before rating again`, 'info');
            return;
        }

        if (!this.currentLocation) {
            this.showMessage('Getting your location...', 'info');

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    };
                    this.saveRatingWithLocation(overallRating);
                },
                (error) => {
                    this.showMessage('Could not get your location. Please enable location permissions.', 'error');
                }
            );
        } else {
            this.saveRatingWithLocation(overallRating);
        }
    }

    async saveRatingWithLocation(overallRating) {
        const ratingData = {
            user: this.currentUser,
            overallRating: overallRating,
            weather: this.currentWeather,
            latitude: this.currentLocation.latitude,
            longitude: this.currentLocation.longitude,
            timestamp: new Date().toISOString()
        };

        await this.saveRating(ratingData);

        // Update rate limiting timestamp
        this.lastRatingTime = Date.now();

        this.showMessage(`Rating ${overallRating}/10 saved successfully!`, 'success');
        this.displayStats();
        this.displayRatingHistory();
        this.addMarkerToMap(ratingData);

        // Add to fullscreen map if in fullscreen mode
        if (this.fullscreenMode && this.fullscreenMap) {
            this.addMarkerToFullscreenMap(ratingData);
        }

        this.highlightButton(overallRating);
    }

    highlightButton(rating) {
        // Highlight regular buttons
        const buttons = document.querySelectorAll('.rating-btn');
        buttons.forEach(btn => btn.classList.remove('selected'));

        const selectedBtn = document.querySelector('.rating-btn[data-rating="' + rating + '"]');
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
            setTimeout(() => {
                selectedBtn.classList.remove('selected');
            }, 2000);
        }

        // Highlight fullscreen buttons
        const fullscreenButtons = document.querySelectorAll('.fullscreen-rating-btn');
        fullscreenButtons.forEach(btn => btn.classList.remove('selected'));

        const selectedFullscreenBtn = document.querySelector('.fullscreen-rating-btn[data-rating="' + rating + '"]');
        if (selectedFullscreenBtn) {
            selectedFullscreenBtn.classList.add('selected');
            setTimeout(() => {
                selectedFullscreenBtn.classList.remove('selected');
            }, 2000);
        }
    }

    async saveRating(ratingData) {
        if (this.useFirebase && window.db) {
            try {
                const docRef = await addDoc(collection(window.db, 'ratings'), ratingData);
                ratingData.id = docRef.id;
                this.ratings.push(ratingData);
                console.log('✅ Saved to cloud');
            } catch (error) {
                console.error('Firebase save error, falling back to localStorage:', error);
                this.saveToLocalStorage(ratingData);
            }
        } else {
            this.saveToLocalStorage(ratingData);
        }
    }

    saveToLocalStorage(ratingData) {
        this.ratings.push(ratingData);
        localStorage.setItem('weatherRatings', JSON.stringify(this.ratings));
        console.log('💾 Saved to localStorage');
    }

    async loadRatings() {
        if (this.useFirebase && window.db) {
            try {
                const q = query(
                    collection(window.db, 'ratings'),
                    where('user', '==', this.currentUser)
                );
                const querySnapshot = await getDocs(q);
                this.ratings = [];
                querySnapshot.forEach((doc) => {
                    this.ratings.push({ id: doc.id, ...doc.data() });
                });
                console.log(`✅ Loaded ${this.ratings.length} ratings from cloud`);
            } catch (error) {
                console.error('Firebase load error, falling back to localStorage:', error);
                this.loadFromLocalStorage();
            }
        } else {
            this.loadFromLocalStorage();
        }
    }

    loadFromLocalStorage() {
        const stored = localStorage.getItem('weatherRatings');
        const allRatings = stored ? JSON.parse(stored) : [];
        this.ratings = allRatings.filter(r => r.user === this.currentUser);
        console.log(`💾 Loaded ${this.ratings.length} ratings from localStorage`);
    }

    showMessage(text, type) {
        const messageEl = document.getElementById('message');
        messageEl.textContent = text;
        messageEl.className = `message ${type} show`;

        setTimeout(() => {
            messageEl.classList.remove('show');
        }, 5000);
    }

    displayRatingHistory() {
        const historyEl = document.getElementById('rating-history');

        if (this.ratings.length === 0) {
            historyEl.innerHTML = '<div class="no-history">No ratings yet. Click a number above to rate the weather!</div>';
            return;
        }

        const sortedRatings = [...this.ratings].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        historyEl.innerHTML = sortedRatings.map(rating => {
            const date = new Date(rating.timestamp);
            const color = this.getRatingColor(rating.overallRating);

            let weatherHTML = '';
            if (rating.weather) {
                weatherHTML = `
                    <div class="history-weather">
                        <div class="history-weather-item">
                            <div class="history-weather-label">Temp</div>
                            <div class="history-weather-value">${rating.weather.temperature}°F</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Humidity</div>
                            <div class="history-weather-value">${rating.weather.humidity}%</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Wind</div>
                            <div class="history-weather-value">${rating.weather.wind} mph</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Precip</div>
                            <div class="history-weather-value">${rating.weather.precipitation}"</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Dew Pt</div>
                            <div class="history-weather-value">${rating.weather.dewPoint}°F</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Time</div>
                            <div class="history-weather-value">${rating.weather.timeOfDay}</div>
                        </div>
                    </div>
                `;
            }

            let detailedHTML = '';
            if (rating.detailedRatings) {
                const details = [];
                if (rating.detailedRatings.temperature) details.push(`<div class="history-detailed-item"><span class="history-detailed-label">Temp:</span><span class="history-detailed-value">${rating.detailedRatings.temperature}/10</span></div>`);
                if (rating.detailedRatings.humidity) details.push(`<div class="history-detailed-item"><span class="history-detailed-label">Humidity:</span><span class="history-detailed-value">${rating.detailedRatings.humidity}/10</span></div>`);
                if (rating.detailedRatings.wind) details.push(`<div class="history-detailed-item"><span class="history-detailed-label">Wind:</span><span class="history-detailed-value">${rating.detailedRatings.wind}/10</span></div>`);
                if (rating.detailedRatings.precipitation) details.push(`<div class="history-detailed-item"><span class="history-detailed-label">Precip:</span><span class="history-detailed-value">${rating.detailedRatings.precipitation}/10</span></div>`);

                if (details.length > 0) {
                    detailedHTML = `<div class="history-detailed">${details.join('')}</div>`;
                }
            }

            return `
                <div class="history-item">
                    <div class="history-header">
                        <div class="history-rating" style="background: ${color}">${rating.overallRating}/10</div>
                        <div class="history-date">${date.toLocaleString()}</div>
                    </div>
                    <div class="history-location">📍 ${rating.latitude.toFixed(4)}, ${rating.longitude.toFixed(4)}</div>
                    ${weatherHTML}
                    ${detailedHTML}
                </div>
            `;
        }).join('');
    }

    initMap() {
        this.map = L.map('map').setView([20, 0], 2);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18
        }).addTo(this.map);

        if (this.ratings.length > 0) {
            const bounds = L.latLngBounds(
                this.ratings.map(r => [r.latitude, r.longitude])
            );
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    displayRatingsOnMap() {
        this.markers.forEach(marker => marker.remove());
        this.markers = [];

        this.ratings.forEach((ratingData) => {
            this.addMarkerToMap(ratingData);
        });
    }

    addMarkerToMap(ratingData) {
        const { overallRating, latitude, longitude, timestamp, weather, detailedRatings } = ratingData;

        const iconColor = this.getRatingColor(overallRating);
        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                background: ${iconColor};
                width: 35px;
                height: 35px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 14px;
            ">${overallRating}</div>`,
            iconSize: [35, 35],
            iconAnchor: [17, 17]
        });

        const marker = L.marker([latitude, longitude], { icon: customIcon })
            .addTo(this.map);

        const date = new Date(timestamp);

        let weatherInfo = '';
        if (weather) {
            weatherInfo = `
                <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #ddd;">
                    <small>
                        🌡️ ${weather.temperature}°F | 💧 ${weather.humidity}% |
                        💨 ${weather.wind} mph<br>
                        ☔ ${weather.precipitation}" | 🌫️ ${weather.dewPoint}°F |
                        ⏰ ${weather.timeOfDay}
                    </small>
                </div>
            `;
        }

        let detailedInfo = '';
        if (detailedRatings && Object.values(detailedRatings).some(v => v !== null)) {
            const details = [];
            if (detailedRatings.temperature) details.push(`Temp: ${detailedRatings.temperature}/10`);
            if (detailedRatings.humidity) details.push(`Humidity: ${detailedRatings.humidity}/10`);
            if (detailedRatings.wind) details.push(`Wind: ${detailedRatings.wind}/10`);
            if (detailedRatings.precipitation) details.push(`Precip: ${detailedRatings.precipitation}/10`);

            if (details.length > 0) {
                detailedInfo = `
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                        <small><strong>Detailed Ratings:</strong><br>${details.join(', ')}</small>
                    </div>
                `;
            }
        }

        marker.bindPopup(`
            <div style="text-align: center; min-width: 180px;">
                <strong style="font-size: 16px;">Overall: ${overallRating}/10</strong><br>
                <span style="color: #666; font-size: 12px;">${date.toLocaleString()}</span>
                ${weatherInfo}
                ${detailedInfo}
            </div>
        `);

        this.markers.push(marker);
    }

    getRatingColor(rating) {
        const colors = [
            '#d32f2f', '#e64a19', '#f57c00', '#fbc02d', '#fdd835',
            '#c0ca33', '#7cb342', '#43a047', '#2e7d32', '#1b5e20'
        ];
        return colors[rating - 1] || '#666';
    }

    displayStats() {
        const statsEl = document.getElementById('stats');

        if (this.ratings.length === 0) {
            statsEl.innerHTML = '<p style="color: #999; font-style: italic;">No ratings yet. Click a number above to rate the weather!</p>';
            return;
        }

        const totalRatings = this.ratings.length;
        const averageRating = (this.ratings.reduce((sum, r) => sum + r.overallRating, 0) / totalRatings).toFixed(1);
        const lastRating = this.ratings[this.ratings.length - 1];

        statsEl.innerHTML = `
            <div class="stat-item">
                <div class="stat-label">Total Ratings</div>
                <div class="stat-value">${totalRatings}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Average Rating</div>
                <div class="stat-value">${averageRating}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Last Rating</div>
                <div class="stat-value">${lastRating.overallRating}/10</div>
            </div>
        `;
    }

    // Friend Management Methods

    async loadUserSettings() {
        if (this.useFirebase && window.db) {
            try {
                const userDoc = await getDocs(query(collection(window.db, 'users'), where('username', '==', this.currentUser)));
                if (!userDoc.empty) {
                    const userData = userDoc.docs[0].data();
                    this.shareRatings = userData.shareRatings !== false;
                }
            } catch (error) {
                console.error('Error loading user settings:', error);
            }
        } else {
            const settings = localStorage.getItem(`${this.currentUser}_settings`);
            if (settings) {
                const parsed = JSON.parse(settings);
                this.shareRatings = parsed.shareRatings !== false;
            }
        }
    }

    async loadFriends() {
        if (this.useFirebase && window.db) {
            try {
                const userDoc = await getDocs(query(collection(window.db, 'users'), where('username', '==', this.currentUser)));
                if (!userDoc.empty) {
                    const userData = userDoc.docs[0].data();
                    this.friends = userData.friends || [];
                }
            } catch (error) {
                console.error('Error loading friends:', error);
            }
        } else {
            const friends = localStorage.getItem(`${this.currentUser}_friends`);
            this.friends = friends ? JSON.parse(friends) : [];
        }
    }

    async addFriend() {
        const friendUsernameInput = document.getElementById('friend-username').value;

        // Sanitize input
        const friendUsername = sanitizeInput(friendUsernameInput, 20);

        if (!friendUsername) {
            this.showMessage('Please enter a valid username', 'error');
            return;
        }

        if (friendUsername === this.currentUser) {
            this.showMessage('You cannot add yourself as a friend!', 'error');
            return;
        }

        if (this.friends.includes(friendUsername)) {
            this.showMessage('Already friends with this user', 'info');
            return;
        }

        // Check if request already sent
        const alreadySent = this.sentRequests.some(req => req.to === friendUsername && req.status === 'pending');
        if (alreadySent) {
            this.showMessage('Friend request already sent', 'info');
            return;
        }

        await this.sendFriendRequest(friendUsername);
    }

    async sendFriendRequest(toUsername) {
        // Rate limiting: 10 requests per 5 minutes
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        // Clean up old requests from tracking array
        this.recentFriendRequests = this.recentFriendRequests.filter(
            timestamp => (now - timestamp) < fiveMinutes
        );

        if (this.recentFriendRequests.length >= 10) {
            this.showMessage('Too many friend requests. Please wait a few minutes before sending more.', 'error');
            return;
        }

        const btn = document.getElementById('add-friend-btn');
        const originalText = btn.textContent;

        // Loading state
        btn.disabled = true;
        btn.textContent = 'Sending...';

        try {
            // Check if user exists
            if (this.useFirebase && window.db) {
                const userQuery = query(collection(window.db, 'users'), where('username', '==', toUsername));
                const userDocs = await getDocs(userQuery);

                if (userDocs.empty) {
                    this.showMessage('User not found. Please check the username.', 'error');
                    return;
                }

                // Send friend request
                await addDoc(collection(window.db, 'friendRequests'), {
                    from: this.currentUser,
                    to: toUsername,
                    status: 'pending',
                    timestamp: new Date().toISOString()
                });

                // Track request for rate limiting
                this.recentFriendRequests.push(now);

                document.getElementById('friend-username').value = '';
                await this.loadFriendRequests();
                this.showMessage(`Friend request sent to ${toUsername}!`, 'success');
            } else {
                // localStorage fallback
                const requests = JSON.parse(localStorage.getItem('friendRequests') || '[]');
                requests.push({
                    from: this.currentUser,
                    to: toUsername,
                    status: 'pending',
                    timestamp: new Date().toISOString()
                });
                localStorage.setItem('friendRequests', JSON.stringify(requests));

                // Track request for rate limiting
                this.recentFriendRequests.push(now);

                document.getElementById('friend-username').value = '';
                await this.loadFriendRequests();
                this.showMessage(`Friend request sent to ${toUsername}!`, 'success');
            }
        } catch (error) {
            console.error('Error sending friend request:', error);
            this.showMessage(getFriendlyErrorMessage(error), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    async loadFriendRequests() {
        this.incomingRequests = [];
        this.sentRequests = [];

        if (this.useFirebase && window.db) {
            try {
                // Load incoming requests
                const incomingQuery = query(
                    collection(window.db, 'friendRequests'),
                    where('to', '==', this.currentUser),
                    where('status', '==', 'pending')
                );
                const incomingSnapshot = await getDocs(incomingQuery);
                incomingSnapshot.forEach(doc => {
                    this.incomingRequests.push({ id: doc.id, ...doc.data() });
                });

                // Load sent requests
                const sentQuery = query(
                    collection(window.db, 'friendRequests'),
                    where('from', '==', this.currentUser),
                    where('status', '==', 'pending')
                );
                const sentSnapshot = await getDocs(sentQuery);
                sentSnapshot.forEach(doc => {
                    this.sentRequests.push({ id: doc.id, ...doc.data() });
                });
            } catch (error) {
                console.error('Error loading friend requests:', error);
            }
        } else {
            // localStorage fallback
            const allRequests = JSON.parse(localStorage.getItem('friendRequests') || '[]');
            this.incomingRequests = allRequests.filter(r => r.to === this.currentUser && r.status === 'pending');
            this.sentRequests = allRequests.filter(r => r.from === this.currentUser && r.status === 'pending');
        }

        this.displayIncomingRequests();
        this.displaySentRequests();
    }

    async acceptFriendRequest(requestId, fromUsername) {
        if (this.useFirebase && window.db) {
            try {
                // Update request status
                const requestRef = doc(window.db, 'friendRequests', requestId);
                await updateDoc(requestRef, { status: 'accepted' });

                // Add to both users' friends lists
                await this.addToFriendsList(fromUsername);
                await this.addUserToOthersFriendsList(fromUsername, this.currentUser);

                await this.loadFriendRequests();
                await this.loadFriends();
                this.showMessage(`You are now friends with ${fromUsername}!`, 'success');
            } catch (error) {
                console.error('Error accepting friend request:', error);
                this.showMessage('Error accepting friend request', 'error');
            }
        } else {
            // localStorage fallback
            const requests = JSON.parse(localStorage.getItem('friendRequests') || '[]');
            const request = requests.find(r => r.from === fromUsername && r.to === this.currentUser);
            if (request) {
                request.status = 'accepted';
                localStorage.setItem('friendRequests', JSON.stringify(requests));
            }

            // Add to friends list (mutual)
            this.friends.push(fromUsername);
            await this.saveFriends();

            await this.loadFriendRequests();
            this.showMessage(`You are now friends with ${fromUsername}!`, 'success');
        }
    }

    async addToFriendsList(friendUsername) {
        if (!this.friends.includes(friendUsername)) {
            this.friends.push(friendUsername);
            await this.saveFriends();
        }
    }

    async addUserToOthersFriendsList(otherUsername, userToAdd) {
        if (this.useFirebase && window.db) {
            try {
                const userQuery = query(collection(window.db, 'users'), where('username', '==', otherUsername));
                const userDocs = await getDocs(userQuery);

                if (!userDocs.empty) {
                    const userDoc = userDocs.docs[0];
                    const userData = userDoc.data();
                    const friends = userData.friends || [];

                    if (!friends.includes(userToAdd)) {
                        friends.push(userToAdd);
                        // Use updateDoc instead of userDoc.ref.update
                        await updateDoc(userDoc.ref, { friends: friends });
                    }
                }
            } catch (error) {
                console.error('Error updating friend list:', error);
            }
        }
    }

    async declineFriendRequest(requestId, fromUsername) {
        if (this.useFirebase && window.db) {
            try {
                const requestRef = doc(window.db, 'friendRequests', requestId);
                await updateDoc(requestRef, { status: 'declined' });

                await this.loadFriendRequests();
                this.showMessage(`Declined friend request from ${fromUsername}`, 'info');
            } catch (error) {
                console.error('Error declining friend request:', error);
                this.showMessage('Error declining friend request', 'error');
            }
        } else {
            // localStorage fallback
            const requests = JSON.parse(localStorage.getItem('friendRequests') || '[]');
            const request = requests.find(r => r.from === fromUsername && r.to === this.currentUser);
            if (request) {
                request.status = 'declined';
                localStorage.setItem('friendRequests', JSON.stringify(requests));
            }

            await this.loadFriendRequests();
            this.showMessage(`Declined friend request from ${fromUsername}`, 'info');
        }
    }

    async cancelFriendRequest(requestId, toUsername) {
        if (this.useFirebase && window.db) {
            try {
                const requestRef = doc(window.db, 'friendRequests', requestId);
                await deleteDoc(requestRef);

                await this.loadFriendRequests();
                this.showMessage(`Cancelled friend request to ${toUsername}`, 'info');
            } catch (error) {
                console.error('Error cancelling friend request:', error);
                this.showMessage('Error cancelling friend request', 'error');
            }
        } else {
            // localStorage fallback
            let requests = JSON.parse(localStorage.getItem('friendRequests') || '[]');
            requests = requests.filter(r => !(r.from === this.currentUser && r.to === toUsername));
            localStorage.setItem('friendRequests', JSON.stringify(requests));

            await this.loadFriendRequests();
            this.showMessage(`Cancelled friend request to ${toUsername}`, 'info');
        }
    }

    displayIncomingRequests() {
        const listEl = document.getElementById('incoming-friend-requests');
        const sectionEl = document.getElementById('incoming-requests-section');

        if (!listEl || !sectionEl) return;

        if (this.incomingRequests.length === 0) {
            sectionEl.style.display = 'none';
            return;
        }

        sectionEl.style.display = 'block';

        listEl.innerHTML = this.incomingRequests.map(request => {
            const initial = request.from.charAt(0).toUpperCase();
            const timeAgo = this.getTimeAgo(request.timestamp);

            return `
                <div class="request-item">
                    <div class="request-info">
                        <div class="request-avatar">${initial}</div>
                        <div class="request-details">
                            <div class="request-from">${request.from}</div>
                            <div class="request-time">${timeAgo}</div>
                        </div>
                    </div>
                    <div class="request-actions">
                        <button class="accept-btn" onclick="app.acceptFriendRequest('${request.id}', '${request.from}')">Accept</button>
                        <button class="decline-btn" onclick="app.declineFriendRequest('${request.id}', '${request.from}')">Decline</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    displaySentRequests() {
        const listEl = document.getElementById('sent-requests-list');

        if (!listEl) return;

        if (this.sentRequests.length === 0) {
            listEl.innerHTML = '<div class="no-requests">No pending friend requests</div>';
            return;
        }

        listEl.innerHTML = this.sentRequests.map(request => {
            return `
                <div class="sent-request-item">
                    <div class="sent-request-info">
                        <span class="sent-request-name">${request.to}</span>
                        <span class="sent-request-status">• Pending</span>
                    </div>
                    <button class="cancel-request-btn" onclick="app.cancelFriendRequest('${request.id}', '${request.to}')">Cancel</button>
                </div>
            `;
        }).join('');
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }

    async removeFriend(friendUsername) {
        if (!confirm(`Remove ${friendUsername} from your friends?`)) return;

        this.friends = this.friends.filter(f => f !== friendUsername);
        await this.saveFriends();
        this.displayFriendsList();
        this.showMessage(`Removed ${friendUsername} from friends`, 'info');

        // Refresh friends' ratings if on that tab
        if (this.currentTab === 'friends-ratings') {
            await this.loadFriendsRatings();
        }
    }

    async saveFriends() {
        if (this.useFirebase && window.db) {
            try {
                const userQuery = query(collection(window.db, 'users'), where('username', '==', this.currentUser));
                const userDocs = await getDocs(userQuery);

                if (userDocs.empty) {
                    await addDoc(collection(window.db, 'users'), {
                        username: this.currentUser,
                        friends: this.friends,
                        shareRatings: this.shareRatings
                    });
                } else {
                    const userDoc = userDocs.docs[0];
                    // Use updateDoc instead of userDoc.ref.update
                    await updateDoc(userDoc.ref, { friends: this.friends });
                }
            } catch (error) {
                console.error('Error saving friends:', error);
            }
        } else {
            localStorage.setItem(`${this.currentUser}_friends`, JSON.stringify(this.friends));
        }
    }

    displayFriendsList() {
        const listEl = document.getElementById('friends-list');

        if (this.friends.length === 0) {
            listEl.innerHTML = '<div class="no-friends">No friends added yet. Add friends to see their ratings!</div>';
            return;
        }

        listEl.innerHTML = this.friends.map(friend => {
            const isSelected = this.selectedFriend === friend;
            const initial = friend.charAt(0).toUpperCase();
            const showRemove = this.manageFriendsMode ? 'show' : '';

            return `
                <div class="friend-list-item ${isSelected ? 'selected' : ''}" data-friend="${friend}">
                    <div class="friend-list-info">
                        <div class="friend-avatar">${initial}</div>
                        <div class="friend-list-name">${friend}</div>
                    </div>
                    <div class="friend-list-actions">
                        <button class="view-btn" onclick="app.${isSelected ? 'hideFriendMap' : 'selectFriend'}('${friend}')">
                            ${isSelected ? 'Hide' : 'View Ratings'}
                        </button>
                        <button class="remove-friend-btn ${showRemove}" onclick="app.removeFriend('${friend}')">Remove</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async selectFriend(friendName) {
        this.selectedFriend = friendName;
        this.displayFriendsList(); // Refresh list to show selected state

        // Load this friend's ratings
        await this.loadSelectedFriendRatings(friendName);

        // Display on map
        this.displaySelectedFriendMap();

        // Display rating history
        this.displayFriendRatingHistory();

        // Show map section
        const mapSection = document.getElementById('friend-map-section');
        const friendNameEl = document.getElementById('selected-friend-name');
        if (mapSection && friendNameEl) {
            mapSection.style.display = 'block';
            friendNameEl.textContent = `${friendName}'s Ratings`;
        }

        // Scroll to map
        mapSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    hideFriendMap() {
        this.selectedFriend = null;
        this.selectedFriendRatings = [];
        this.displayFriendsList(); // Refresh list to show unselected state

        // Hide map section
        const mapSection = document.getElementById('friend-map-section');
        if (mapSection) {
            mapSection.style.display = 'none';
        }

        // Clear markers
        this.friendsMarkers.forEach(marker => marker.remove());
        this.friendsMarkers = [];
    }

    toggleManageFriendsMode() {
        this.manageFriendsMode = !this.manageFriendsMode;
        this.displayFriendsList();

        const message = this.manageFriendsMode ? 'Manage mode enabled' : 'Manage mode disabled';
        this.showMessage(message, 'info');
    }

    enterFullscreenMode() {
        this.fullscreenMode = true;

        // Hide main app
        document.getElementById('main-app').style.display = 'none';

        // Show fullscreen view
        document.getElementById('fullscreen-map-view').style.display = 'block';

        // Initialize fullscreen map if not already done
        if (!this.fullscreenMap) {
            this.initFullscreenMap();
        } else {
            // Force map to recalculate size
            setTimeout(() => {
                this.fullscreenMap.invalidateSize();
            }, 100);
        }

        // Display current ratings on fullscreen map
        this.displayRatingsOnFullscreenMap();
    }

    exitFullscreenMode() {
        this.fullscreenMode = false;

        // Hide fullscreen view
        document.getElementById('fullscreen-map-view').style.display = 'none';

        // Show main app
        document.getElementById('main-app').style.display = 'block';

        // Force main map to recalculate size
        setTimeout(() => {
            if (this.map) {
                this.map.invalidateSize();
            }
        }, 100);
    }

    initFullscreenMap() {
        const mapEl = document.getElementById('fullscreen-map');
        if (!mapEl) return;

        this.fullscreenMap = L.map('fullscreen-map').setView([20, 0], 2);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18
        }).addTo(this.fullscreenMap);

        // Fit to ratings if available
        if (this.ratings.length > 0) {
            const bounds = L.latLngBounds(
                this.ratings.map(r => [r.latitude, r.longitude])
            );
            this.fullscreenMap.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    displayRatingsOnFullscreenMap() {
        if (!this.fullscreenMap) return;

        // Clear existing markers
        this.fullscreenMarkers.forEach(marker => marker.remove());
        this.fullscreenMarkers = [];

        // Add markers for each rating
        this.ratings.forEach((ratingData) => {
            this.addMarkerToFullscreenMap(ratingData);
        });

        // Fit map to show all markers
        if (this.ratings.length > 0) {
            const bounds = L.latLngBounds(
                this.ratings.map(r => [r.latitude, r.longitude])
            );
            this.fullscreenMap.fitBounds(bounds, { padding: [100, 100] });
        }
    }

    addMarkerToFullscreenMap(ratingData) {
        const { overallRating, latitude, longitude, timestamp, weather } = ratingData;

        const iconColor = this.getRatingColor(overallRating);
        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                background: ${iconColor};
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 16px;
            ">${overallRating}</div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        const marker = L.marker([latitude, longitude], { icon: customIcon })
            .addTo(this.fullscreenMap);

        const date = new Date(timestamp);

        let weatherInfo = '';
        if (weather) {
            weatherInfo = `
                <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #ddd;">
                    <small>
                        🌡️ ${weather.temperature}°F | 💧 ${weather.humidity}% |
                        💨 ${weather.wind} mph<br>
                        ☔ ${weather.precipitation}" | 🌫️ ${weather.dewPoint}°F |
                        ⏰ ${weather.timeOfDay}
                    </small>
                </div>
            `;
        }

        marker.bindPopup(`
            <div style="text-align: center; min-width: 180px;">
                <strong style="font-size: 18px;">Overall: ${overallRating}/10</strong><br>
                <span style="color: #666; font-size: 12px;">${date.toLocaleString()}</span>
                ${weatherInfo}
            </div>
        `);

        this.fullscreenMarkers.push(marker);
    }

    async loadSelectedFriendRatings(friendName) {
        this.selectedFriendRatings = [];

        if (this.useFirebase && window.db) {
            try {
                // Check if friend shares their ratings
                const userQuery = query(collection(window.db, 'users'), where('username', '==', friendName));
                const userDocs = await getDocs(userQuery);

                let canView = true;
                if (!userDocs.empty) {
                    const userData = userDocs.docs[0].data();
                    canView = userData.shareRatings !== false;
                }

                if (canView) {
                    // Load friend's ratings
                    const ratingsQuery = query(
                        collection(window.db, 'ratings'),
                        where('user', '==', friendName)
                    );
                    const ratingsSnapshot = await getDocs(ratingsQuery);
                    ratingsSnapshot.forEach(doc => {
                        this.selectedFriendRatings.push({ id: doc.id, ...doc.data() });
                    });
                } else {
                    this.showMessage(`${friendName} has privacy enabled`, 'info');
                }
            } catch (error) {
                console.error('Error loading friend ratings:', error);
            }
        } else {
            // localStorage fallback
            const friendSettings = localStorage.getItem(`${friendName}_settings`);
            const settings = friendSettings ? JSON.parse(friendSettings) : { shareRatings: true };

            if (settings.shareRatings !== false) {
                const stored = localStorage.getItem('weatherRatings');
                if (stored) {
                    const allRatings = JSON.parse(stored);
                    this.selectedFriendRatings = allRatings.filter(r => r.user === friendName);
                }
            } else {
                this.showMessage(`${friendName} has privacy enabled`, 'info');
            }
        }
    }

    displaySelectedFriendMap() {
        if (!this.friendsMap) return;

        // Force map to recalculate size (needed because it was hidden)
        setTimeout(() => {
            this.friendsMap.invalidateSize();
        }, 100);

        // Clear existing markers
        this.friendsMarkers.forEach(marker => marker.remove());
        this.friendsMarkers = [];

        if (this.selectedFriendRatings.length === 0) {
            this.showMessage(`${this.selectedFriend} hasn't rated any weather yet`, 'info');
            return;
        }

        // Add markers for selected friend's ratings
        this.selectedFriendRatings.forEach(rating => {
            const iconColor = this.getRatingColor(rating.overallRating);
            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                    background: ${iconColor};
                    width: 35px;
                    height: 35px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 14px;
                ">${rating.overallRating}</div>`,
                iconSize: [35, 35],
                iconAnchor: [17, 17]
            });

            const marker = L.marker([rating.latitude, rating.longitude], { icon: customIcon })
                .addTo(this.friendsMap);

            const date = new Date(rating.timestamp);
            let weatherInfo = '';
            if (rating.weather) {
                weatherInfo = `
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                        <small>
                            🌡️ ${rating.weather.temperature}°F | 💧 ${rating.weather.humidity}% |
                            💨 ${rating.weather.wind} mph
                        </small>
                    </div>
                `;
            }

            marker.bindPopup(`
                <div style="text-align: center; min-width: 180px;">
                    <strong style="font-size: 16px;">${this.selectedFriend}: ${rating.overallRating}/10</strong><br>
                    <span style="color: #666; font-size: 12px;">${date.toLocaleString()}</span>
                    ${weatherInfo}
                </div>
            `);

            this.friendsMarkers.push(marker);
        });

        // Fit map to show all markers
        if (this.selectedFriendRatings.length > 0) {
            const bounds = L.latLngBounds(
                this.selectedFriendRatings.map(r => [r.latitude, r.longitude])
            );
            this.friendsMap.fitBounds(bounds, { padding: [50, 50] });
        }

        // Update stats
        this.displaySelectedFriendStats();
    }

    displaySelectedFriendStats() {
        const statsEl = document.getElementById('friends-stats');
        if (!statsEl || this.selectedFriendRatings.length === 0) {
            if (statsEl) statsEl.innerHTML = '';
            return;
        }

        const totalRatings = this.selectedFriendRatings.length;
        const averageRating = (this.selectedFriendRatings.reduce((sum, r) => sum + r.overallRating, 0) / totalRatings).toFixed(1);
        const highestRating = Math.max(...this.selectedFriendRatings.map(r => r.overallRating));
        const lowestRating = Math.min(...this.selectedFriendRatings.map(r => r.overallRating));
        const sortedByDate = [...this.selectedFriendRatings].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const mostRecent = sortedByDate[0];

        statsEl.innerHTML = `
            <div class="stat-item">
                <div class="stat-label">Total Ratings</div>
                <div class="stat-value">${totalRatings}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Average Rating</div>
                <div class="stat-value">${averageRating}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Highest</div>
                <div class="stat-value">${highestRating}/10</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Lowest</div>
                <div class="stat-value">${lowestRating}/10</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Most Recent</div>
                <div class="stat-value">${mostRecent.overallRating}/10</div>
            </div>
        `;
    }

    displayFriendRatingHistory() {
        const historyEl = document.getElementById('friend-rating-history');
        if (!historyEl) return;

        if (this.selectedFriendRatings.length === 0) {
            historyEl.innerHTML = `<div class="no-history">${this.selectedFriend} hasn't rated any weather yet.</div>`;
            return;
        }

        const sortedRatings = [...this.selectedFriendRatings].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        historyEl.innerHTML = sortedRatings.map(rating => {
            const date = new Date(rating.timestamp);
            const color = this.getRatingColor(rating.overallRating);

            let weatherHTML = '';
            if (rating.weather) {
                weatherHTML = `
                    <div class="history-weather">
                        <div class="history-weather-item">
                            <div class="history-weather-label">Temp</div>
                            <div class="history-weather-value">${rating.weather.temperature}°F</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Humidity</div>
                            <div class="history-weather-value">${rating.weather.humidity}%</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Wind</div>
                            <div class="history-weather-value">${rating.weather.wind} mph</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Precip</div>
                            <div class="history-weather-value">${rating.weather.precipitation}"</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Dew Pt</div>
                            <div class="history-weather-value">${rating.weather.dewPoint}°F</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Time</div>
                            <div class="history-weather-value">${rating.weather.timeOfDay}</div>
                        </div>
                    </div>
                `;
            }

            let detailedHTML = '';
            if (rating.detailedRatings) {
                const details = [];
                if (rating.detailedRatings.temperature) details.push(`<div class="history-detailed-item"><span class="history-detailed-label">Temp:</span><span class="history-detailed-value">${rating.detailedRatings.temperature}/10</span></div>`);
                if (rating.detailedRatings.humidity) details.push(`<div class="history-detailed-item"><span class="history-detailed-label">Humidity:</span><span class="history-detailed-value">${rating.detailedRatings.humidity}/10</span></div>`);
                if (rating.detailedRatings.wind) details.push(`<div class="history-detailed-item"><span class="history-detailed-label">Wind:</span><span class="history-detailed-value">${rating.detailedRatings.wind}/10</span></div>`);
                if (rating.detailedRatings.precipitation) details.push(`<div class="history-detailed-item"><span class="history-detailed-label">Precip:</span><span class="history-detailed-value">${rating.detailedRatings.precipitation}/10</span></div>`);

                if (details.length > 0) {
                    detailedHTML = `<div class="history-detailed">${details.join('')}</div>`;
                }
            }

            return `
                <div class="history-item">
                    <div class="history-header">
                        <div class="history-rating" style="background: ${color}">${rating.overallRating}/10</div>
                        <div class="history-date">${date.toLocaleString()}</div>
                    </div>
                    <div class="history-location">📍 ${rating.latitude.toFixed(4)}, ${rating.longitude.toFixed(4)}</div>
                    ${weatherHTML}
                    ${detailedHTML}
                </div>
            `;
        }).join('');
    }

    async togglePrivacy(shareRatings) {
        this.shareRatings = shareRatings;

        if (this.useFirebase && window.db) {
            try {
                const userQuery = query(collection(window.db, 'users'), where('username', '==', this.currentUser));
                const userDocs = await getDocs(userQuery);

                if (userDocs.empty) {
                    await addDoc(collection(window.db, 'users'), {
                        username: this.currentUser,
                        friends: this.friends,
                        shareRatings: this.shareRatings
                    });
                } else {
                    const userDoc = userDocs.docs[0];
                    // Use updateDoc instead of userDoc.ref.update
                    await updateDoc(userDoc.ref, { shareRatings: this.shareRatings });
                }
            } catch (error) {
                console.error('Error saving privacy settings:', error);
            }
        } else {
            localStorage.setItem(`${this.currentUser}_settings`, JSON.stringify({ shareRatings: this.shareRatings }));
        }

        const message = shareRatings ? 'Your ratings are now shared with friends' : 'Your ratings are now private';
        this.showMessage(message, 'success');
    }

    async switchTab(tabName) {
        this.currentTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });

        const activeTab = document.getElementById(`${tabName}-tab`);
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.style.display = 'block';
        }

        // Load friend requests and ratings when switching to friends tab
        if (tabName === 'friends-ratings') {
            await this.loadFriendRequests();
            this.displayFriendsList();
        }
    }

    async loadFriendsRatings() {
        if (this.friends.length === 0) {
            this.friendsRatings = [];
            return;
        }

        if (this.useFirebase && window.db) {
            try {
                // Get all friends who share their ratings
                const friendsWithSharing = [];
                for (const friend of this.friends) {
                    const userQuery = query(collection(window.db, 'users'), where('username', '==', friend));
                    const userDocs = await getDocs(userQuery);
                    if (!userDocs.empty) {
                        const userData = userDocs.docs[0].data();
                        if (userData.shareRatings !== false) {
                            friendsWithSharing.push(friend);
                        }
                    }
                }

                // Load ratings from friends who share
                this.friendsRatings = [];
                if (friendsWithSharing.length > 0) {
                    const ratingsQuery = query(
                        collection(window.db, 'ratings'),
                        where('user', 'in', friendsWithSharing)
                    );
                    const ratingsSnapshot = await getDocs(ratingsQuery);
                    ratingsSnapshot.forEach(doc => {
                        this.friendsRatings.push({ id: doc.id, ...doc.data() });
                    });
                }
            } catch (error) {
                console.error('Error loading friends ratings:', error);
            }
        } else {
            // localStorage fallback
            this.friendsRatings = [];
            for (const friend of this.friends) {
                const friendSettings = localStorage.getItem(`${friend}_settings`);
                const settings = friendSettings ? JSON.parse(friendSettings) : { shareRatings: true };

                if (settings.shareRatings !== false) {
                    const stored = localStorage.getItem('weatherRatings');
                    if (stored) {
                        const allRatings = JSON.parse(stored);
                        const friendRatings = allRatings.filter(r => r.user === friend);
                        this.friendsRatings.push(...friendRatings);
                    }
                }
            }
        }
    }

    displayFriendsRatings() {
        const historyEl = document.getElementById('friends-rating-history');

        if (this.friends.length === 0) {
            historyEl.innerHTML = '<div class="no-history">Add friends to see their ratings!</div>';
            return;
        }

        if (this.friendsRatings.length === 0) {
            historyEl.innerHTML = '<div class="no-history">Your friends haven\'t rated any weather yet, or they have privacy enabled.</div>';
            return;
        }

        // Sort by most recent
        const sorted = [...this.friendsRatings].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        historyEl.innerHTML = sorted.map(rating => {
            const date = new Date(rating.timestamp);
            const color = this.getRatingColor(rating.overallRating);

            let weatherHTML = '';
            if (rating.weather) {
                weatherHTML = `
                    <div class="history-weather">
                        <div class="history-weather-item">
                            <div class="history-weather-label">Temp</div>
                            <div class="history-weather-value">${rating.weather.temperature}°F</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Humidity</div>
                            <div class="history-weather-value">${rating.weather.humidity}%</div>
                        </div>
                        <div class="history-weather-item">
                            <div class="history-weather-label">Wind</div>
                            <div class="history-weather-value">${rating.weather.wind} mph</div>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="history-item">
                    <div class="history-header">
                        <div>
                            <div class="history-rating" style="background: ${color}">${rating.overallRating}/10</div>
                            <div style="margin-top: 5px; font-weight: bold; color: #667eea;">by ${rating.user}</div>
                        </div>
                        <div class="history-date">${date.toLocaleString()}</div>
                    </div>
                    <div class="history-location">📍 ${rating.latitude.toFixed(4)}, ${rating.longitude.toFixed(4)}</div>
                    ${weatherHTML}
                </div>
            `;
        }).join('');
    }

    initFriendsMap() {
        const mapEl = document.getElementById('friends-map');
        if (!mapEl) return;

        this.friendsMap = L.map('friends-map').setView([20, 0], 2);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18
        }).addTo(this.friendsMap);
    }

    displayFriendsMap() {
        if (!this.friendsMap) return;

        // Clear existing markers
        this.friendsMarkers.forEach(marker => marker.remove());
        this.friendsMarkers = [];

        if (this.friendsRatings.length === 0) return;

        // Add markers for each rating
        this.friendsRatings.forEach(rating => {
            const iconColor = this.getRatingColor(rating.overallRating);
            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                    background: ${iconColor};
                    width: 35px;
                    height: 35px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 14px;
                ">${rating.overallRating}</div>`,
                iconSize: [35, 35],
                iconAnchor: [17, 17]
            });

            const marker = L.marker([rating.latitude, rating.longitude], { icon: customIcon })
                .addTo(this.friendsMap);

            const date = new Date(rating.timestamp);
            marker.bindPopup(`
                <div style="text-align: center; min-width: 180px;">
                    <strong style="font-size: 16px;">${rating.user}: ${rating.overallRating}/10</strong><br>
                    <span style="color: #666; font-size: 12px;">${date.toLocaleString()}</span>
                </div>
            `);

            this.friendsMarkers.push(marker);
        });

        // Fit map to show all markers
        if (this.friendsRatings.length > 0) {
            const bounds = L.latLngBounds(
                this.friendsRatings.map(r => [r.latitude, r.longitude])
            );
            this.friendsMap.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}

// Initialize the app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new WeatherRater();
});
