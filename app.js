// URL de ton Azure Function (HTTP Trigger)
const functionUrl = "https://<TON_AZURE_FUNCTION>.azurewebsites.net/api/weather";

// Met à jour le dashboard
function updateWeather(data) {
    document.getElementById("temperature").textContent = `${data.temperature} °C`;
    document.getElementById("humidity").textContent = `Humidité: ${data.humidity} %`;
    document.getElementById("wind").textContent = `Vent: ${data.wind} km/h`;
    document.getElementById("condition").textContent = `Condition: ${data.condition}`;

    // Historique
    const li = document.createElement("li");
    li.textContent = `${new Date().toLocaleTimeString()} - ${data.temperature}°C, ${data.condition}`;
    document.getElementById("updates").prepend(li);
}

// Récupère les données depuis l’Azure Function
async function fetchWeather() {
    try {
        const response = await fetch(functionUrl);
        const data = await response.json();
        updateWeather(data);
    } catch (err) {
        console.error("Erreur lors de la récupération météo:", err);
    }
}

// Rafraîchit toutes les 10 secondes
setInterval(fetchWeather, 10000);

// Premier appel au chargement
fetchWeather();
