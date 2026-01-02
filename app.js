// Weather Rater App with Cloud Storage (Firebase) and User Profiles

// Import Firebase Firestore functions (available after Firebase script loads)
let collection, addDoc, query, where, getDocs, onSnapshot, deleteDoc, doc;

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
    }
}, 100);

class WeatherRater {
    constructor() {
        this.currentUser = this.loadCurrentUser();
        this.ratings = [];
        this.friends = [];
        this.friendsRatings = [];
        this.selectedFriend = null;
        this.selectedFriendRatings = [];
        this.map = null;
        this.friendsMap = null;
        this.markers = [];
        this.friendsMarkers = [];
        this.currentWeather = null;
        this.currentLocation = null;
        this.useFirebase = false;
        this.shareRatings = true;
        this.currentTab = 'my-ratings';

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
        if (this.currentUser) {
            await this.loadRatings();
            await this.loadUserSettings();
            await this.loadFriends();
            this.showMainApp();
        } else {
            this.showProfileSetup();
        }
    }

    showProfileSetup() {
        document.getElementById('user-profile-section').style.display = 'block';
        document.getElementById('main-app').style.display = 'none';

        document.getElementById('save-username-btn').addEventListener('click', async () => {
            const username = document.getElementById('username-input').value.trim();
            if (username) {
                this.setUser(username);
                await this.loadRatings();
                this.showMainApp();
            } else {
                alert('Please enter your name');
            }
        });

        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('save-username-btn').click();
            }
        });
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
            if (confirm('Switch to a different user? Your ratings are saved.')) {
                this.currentUser = null;
                localStorage.removeItem('currentUser');
                location.reload();
            }
        });

        document.getElementById('toggle-detailed-btn').addEventListener('click', () => {
            const detailedSection = document.getElementById('detailed-ratings');
            const toggleBtn = document.getElementById('toggle-detailed-btn');

            if (detailedSection.style.display === 'none') {
                detailedSection.style.display = 'block';
                toggleBtn.classList.add('active');
            } else {
                detailedSection.style.display = 'none';
                toggleBtn.classList.remove('active');
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
        const detailedRatings = {
            temperature: parseInt(document.getElementById('rating-temperature').value) || null,
            humidity: parseInt(document.getElementById('rating-humidity').value) || null,
            wind: parseInt(document.getElementById('rating-wind').value) || null,
            precipitation: parseInt(document.getElementById('rating-precipitation').value) || null
        };

        const ratingData = {
            user: this.currentUser,
            overallRating: overallRating,
            detailedRatings: detailedRatings,
            weather: this.currentWeather,
            latitude: this.currentLocation.latitude,
            longitude: this.currentLocation.longitude,
            timestamp: new Date().toISOString()
        };

        await this.saveRating(ratingData);
        this.showMessage(`Rating ${overallRating}/10 saved successfully!`, 'success');
        this.displayStats();
        this.displayRatingHistory();
        this.addMarkerToMap(ratingData);
        this.highlightButton(overallRating);

        // Reset detailed ratings
        document.getElementById('rating-temperature').value = '';
        document.getElementById('rating-humidity').value = '';
        document.getElementById('rating-wind').value = '';
        document.getElementById('rating-precipitation').value = '';
    }

    highlightButton(rating) {
        const buttons = document.querySelectorAll('.rating-btn');
        buttons.forEach(btn => btn.classList.remove('selected'));

        const selectedBtn = document.querySelector(`[data-rating="${rating}"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
            setTimeout(() => {
                selectedBtn.classList.remove('selected');
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
        const friendUsername = document.getElementById('friend-username').value.trim();

        if (!friendUsername) {
            this.showMessage('Please enter a username', 'error');
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

        this.friends.push(friendUsername);
        await this.saveFriends();
        document.getElementById('friend-username').value = '';
        this.displayFriendsList();
        this.showMessage(`Added ${friendUsername} as a friend!`, 'success');
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
                    await userDoc.ref.update({ friends: this.friends });
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

            return `
                <div class="friend-list-item ${isSelected ? 'selected' : ''}" data-friend="${friend}">
                    <div class="friend-list-info">
                        <div class="friend-avatar">${initial}</div>
                        <div class="friend-list-name">${friend}</div>
                    </div>
                    <div class="friend-list-actions">
                        <button class="view-btn" onclick="app.selectFriend('${friend}')">
                            ${isSelected ? 'Viewing' : 'View Ratings'}
                        </button>
                        <button class="remove-friend-btn" onclick="app.removeFriend('${friend}')">Remove</button>
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
        const lastRating = this.selectedFriendRatings[this.selectedFriendRatings.length - 1];

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
                    await userDoc.ref.update({ shareRatings: this.shareRatings });
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

        // Load friends' ratings if switching to friends tab
        if (tabName === 'friends-ratings') {
            await this.loadFriendsRatings();
            this.displayFriendsRatings();
            this.displayFriendsMap();
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
