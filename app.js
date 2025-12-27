// Weather Rater App
class WeatherRater {
    constructor() {
        this.ratings = this.loadRatings();
        this.map = null;
        this.markers = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initMap();
        this.displayStats();
        this.displayRatingsOnMap();
    }

    setupEventListeners() {
        const buttons = document.querySelectorAll('.rating-btn');
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.handleRating(parseInt(e.target.dataset.rating));
            });
        });
    }

    handleRating(rating) {
        // Get geolocation
        if ('geolocation' in navigator) {
            this.showMessage('Getting your location...', 'info');

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const ratingData = {
                        rating: rating,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        timestamp: new Date().toISOString(),
                        accuracy: position.coords.accuracy
                    };

                    this.saveRating(ratingData);
                    this.showMessage(`Rating ${rating}/10 saved successfully!`, 'success');
                    this.displayStats();
                    this.addMarkerToMap(ratingData);

                    // Highlight selected button briefly
                    this.highlightButton(rating);
                },
                (error) => {
                    console.error('Geolocation error:', error);
                    let errorMsg = 'Could not get your location. ';

                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            errorMsg += 'Please enable location permissions.';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMsg += 'Location information is unavailable.';
                            break;
                        case error.TIMEOUT:
                            errorMsg += 'Location request timed out.';
                            break;
                        default:
                            errorMsg += 'An unknown error occurred.';
                    }

                    this.showMessage(errorMsg, 'error');
                }
            );
        } else {
            this.showMessage('Geolocation is not supported by your browser.', 'error');
        }
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

    initMap() {
        // Initialize the map centered on world view
        this.map = L.map('map').setView([20, 0], 2);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18
        }).addTo(this.map);

        // If there are existing ratings, fit map to show them all
        if (this.ratings.length > 0) {
            const bounds = L.latLngBounds(
                this.ratings.map(r => [r.latitude, r.longitude])
            );
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    displayRatingsOnMap() {
        // Clear existing markers
        this.markers.forEach(marker => marker.remove());
        this.markers = [];

        // Add markers for each rating
        this.ratings.forEach((ratingData, index) => {
            this.addMarkerToMap(ratingData, index);
        });
    }

    addMarkerToMap(ratingData, index) {
        const { rating, latitude, longitude, timestamp } = ratingData;

        // Create custom icon based on rating
        const iconColor = this.getRatingColor(rating);
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
            ">${rating}</div>`,
            iconSize: [35, 35],
            iconAnchor: [17, 17]
        });

        // Create marker
        const marker = L.marker([latitude, longitude], { icon: customIcon })
            .addTo(this.map);

        // Add popup
        const date = new Date(timestamp);
        const formattedDate = date.toLocaleString();

        marker.bindPopup(`
            <div style="text-align: center; min-width: 150px;">
                <strong style="font-size: 16px;">Rating: ${rating}/10</strong><br>
                <span style="color: #666; font-size: 12px;">${formattedDate}</span><br>
                <span style="color: #888; font-size: 11px;">Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}</span>
            </div>
        `);

        this.markers.push(marker);

        // If this is a new rating, zoom to it
        if (index === undefined) {
            this.map.setView([latitude, longitude], 13);
            marker.openPopup();
        }
    }

    getRatingColor(rating) {
        // Color gradient from red (bad) to green (good)
        const colors = [
            '#d32f2f', // 1 - dark red
            '#e64a19', // 2 - red-orange
            '#f57c00', // 3 - orange
            '#fbc02d', // 4 - yellow-orange
            '#fdd835', // 5 - yellow
            '#c0ca33', // 6 - yellow-green
            '#7cb342', // 7 - light green
            '#43a047', // 8 - green
            '#2e7d32', // 9 - dark green
            '#1b5e20'  // 10 - very dark green
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
        const averageRating = (this.ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings).toFixed(1);
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
                <div class="stat-value">${lastRating.rating}/10</div>
            </div>
        `;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WeatherRater();
});
