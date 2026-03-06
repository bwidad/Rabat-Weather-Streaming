// Initialisation du graphique Chart.js
const ctx = document.getElementById("tempChart").getContext("2d");
const tempChart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [], // timestamps
    datasets: [{
      label: "Température (°C)",
      data: [],
      borderColor: "#004080",
      backgroundColor: "rgba(0,64,128,0.2)",
      fill: true,
      tension: 0.3
    }]
  },
  options: {
    responsive: true,
    scales: {
      x: {
        title: { display: true, text: "Heure" }
      },
      y: {
        title: { display: true, text: "Température (°C)" }
      }
    }
  }
});

// Fonction pour récupérer les données météo depuis Azure
async function fetchWeather() {
  try {
    // Remplacez par l’URL réelle de votre Azure Function ou API
    const response = await fetch("https://salmon-dune-0a8398c10.6.azurestaticapps.net");
    const data = await response.json();

    // Mise à jour des infos texte
    document.getElementById("temperature").textContent = `${data.temperature} °C`;
    document.getElementById("humidity").textContent = `${data.humidity} %`;
    document.getElementById("wind").textContent = `${data.wind} km/h`;
    document.getElementById("condition").textContent = data.condition;

    // Mise à jour du graphique
    const now = new Date().toLocaleTimeString();
    tempChart.data.labels.push(now);
    tempChart.data.datasets[0].data.push(data.temperature);

    // Limiter à 10 points pour garder le graphique lisible
    if (tempChart.data.labels.length > 10) {
      tempChart.data.labels.shift();
      tempChart.data.datasets[0].data.shift();
    }

    tempChart.update();
  } catch (error) {
    console.error("Erreur lors de la récupération des données météo :", error);
  }
}

// Mise à jour toutes les 10 secondes
setInterval(fetchWeather, 10000);
fetchWeather();

