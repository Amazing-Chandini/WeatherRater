// Weather Rater App with User Profiles and Detailed Ratings
class WeatherRater {
    constructor() {
        this.currentUser = this.loadCurrentUser();
        this.ratings = this.loadRatings();
        this.map = null;
        this.markers = [];
        this.currentWeather = null;
        this.currentLocation = null;

        // Free weather API - OpenWeatherMap (no key required for basic usage)
        // Note: For production, get a free API key at openweathermap.org
        this.weatherAPIKey = 'demo'; // Using demo mode

        this.init();
    }

    init() {
        if (this.currentUser) {
            this.showMainApp();
        } else {
            this.showProfileSetup();
        }
    }

    showProfileSetup() {
        document.getElementById('user-profile-section').style.display = 'block';
        document.getElementById('main-app').style.display = 'none';

        document.getElementById('save-username-btn').addEventListener('click', () => {
            const username = document.getElementById('username-input').value.trim();
            if (username) {
                this.setUser(username);
                this.showMainApp();
            } else {
                alert('Please enter your name');
            }
        });

        // Allow Enter key to submit
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('save-username-btn').click();
            }
        });
    }

    showMainApp() {
        document.getElementById('user-profile-section').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        document.getElementById('current-user').textContent = `👤 ${this.currentUser}`;

        this.setupEventListeners();
        this.initMap();
        this.displayStats();
        this.displayRatingsOnMap();
        this.displayRatingHistory();
        this.getCurrentLocationAndWeather();
    }

    setupEventListeners() {
        // Overall rating buttons
        const buttons = document.querySelectorAll('.rating-btn');
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.handleRating(parseInt(e.target.dataset.rating));
            });
        });

        // Change user button
        document.getElementById('change-user-btn').addEventListener('click', () => {
            if (confirm('Switch to a different user? Your ratings are saved.')) {
                this.currentUser = null;
                localStorage.removeItem('currentUser');
                location.reload();
            }
        });

        // Toggle detailed ratings
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
    }

    setUser(username) {
        this.currentUser = username;
        localStorage.setItem('currentUser', username);
    }

    loadCurrentUser() {
        return localStorage.getItem('currentUser');
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
            // Using Open-Meteo API (no key required, free)
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
            // Use simulated data if API fails
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

    saveRatingWithLocation(overallRating) {
        // Get detailed ratings
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

        this.saveRating(ratingData);
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

    saveRating(ratingData) {
        this.ratings.push(ratingData);
        localStorage.setItem('weatherRatings', JSON.stringify(this.ratings));
    }

    loadRatings() {
        const stored = localStorage.getItem('weatherRatings');
        return stored ? JSON.parse(stored) : [];
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
        const userRatings = this.ratings.filter(r => r.user === this.currentUser);

        if (userRatings.length === 0) {
            historyEl.innerHTML = '<div class="no-history">No ratings yet. Click a number above to rate the weather!</div>';
            return;
        }

        // Sort by most recent first
        userRatings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        historyEl.innerHTML = userRatings.map(rating => {
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

        const userRatings = this.ratings.filter(r => r.user === this.currentUser);
        if (userRatings.length > 0) {
            const bounds = L.latLngBounds(
                userRatings.map(r => [r.latitude, r.longitude])
            );
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    displayRatingsOnMap() {
        this.markers.forEach(marker => marker.remove());
        this.markers = [];

        const userRatings = this.ratings.filter(r => r.user === this.currentUser);
        userRatings.forEach((ratingData) => {
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

        // If this is a new rating, zoom to it
        if (this.markers.length === this.ratings.filter(r => r.user === this.currentUser).length) {
            this.map.setView([latitude, longitude], 13);
            marker.openPopup();
        }
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
        const userRatings = this.ratings.filter(r => r.user === this.currentUser);

        if (userRatings.length === 0) {
            statsEl.innerHTML = '<p style="color: #999; font-style: italic;">No ratings yet. Click a number above to rate the weather!</p>';
            return;
        }

        const totalRatings = userRatings.length;
        const averageRating = (userRatings.reduce((sum, r) => sum + r.overallRating, 0) / totalRatings).toFixed(1);
        const lastRating = userRatings[userRatings.length - 1];

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
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WeatherRater();
});
