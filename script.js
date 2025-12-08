// --- GLOBAL VARIABLES ---
let courseList = []; 
let myChart = null; 

// CONFIG: Grading Standards (Verified Global & Nigerian Metrics)
const GRADING_SYSTEMS = {
    // 1. NUC Standard (Most Nigerian Unis & Colleges of Ed)
    // Scale: 5.0 | A starts at 70
    'ng': { type: '5.0_ng', max: 5 }, 
    
    // 2. Special 7.0 Scale (Used for Postgraduates or Older Systems)
    // Scale: 7.0 | A (70+) = 7pts
    'ui': { type: '7.0_special', max: 7 }, // Renamed type for clarity

    // 3. Nigerian Polytechnic (NBTE Standard 4.0)
    // Scale: 4.0 | A starts at 75
    'poly': { type: '4.0_poly', max: 4 },

    // 4. USA Standard
    'us': { type: '4.0_us', max: 4 },
    
    // 5. India (UGC Standard)
    'in': { type: '10.0', max: 10 }
};

const button = document.getElementById('addBtn');
button.addEventListener('click', addCourseToTable);

// --- 1. INITIALIZATION ---
window.onload = function() {
    const savedData = localStorage.getItem("myGrades");
    if (savedData) {
        courseList = JSON.parse(savedData);
    }
    
    loadProfile();
    updateSemesterOptions();
    renderTable(); // This now auto-calculates based on the default system
};

// --- 2. DYNAMIC DROPDOWNS ---
function updateSemesterOptions() {
    const duration = parseFloat(document.getElementById('programDuration').value);
    const termsPerYear = parseInt(document.getElementById('termSystem').value);
    
    const semSelect = document.getElementById('semesterSelect');
    const filterSelect = document.getElementById('filterSelect');
    
    semSelect.innerHTML = '';
    const currentFilter = filterSelect.value;
    filterSelect.innerHTML = '<option value="all">Show All Semesters</option>';

    for(let year = 1; year <= Math.ceil(duration); year++) {
        for(let term = 1; term <= termsPerYear; term++) {
            const value = `${year}.${term}`;
            const label = `Year ${year} - Term ${term}`;
            createOption(semSelect, value, label);
            createOption(filterSelect, value, label);
        }
    }
    filterSelect.value = currentFilter;
}

function createOption(selectElement, value, text) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.innerText = text;
    selectElement.appendChild(opt);
}

// --- 3. RECALCULATE ON SYSTEM CHANGE ---
function recalculateAll() {
    // When the user changes the grading system (e.g., Nigeria to US)
    // We re-render the table. The renderTable function will pull the NEW settings
    // and re-calculate points for every course in the list.
    renderTable();
    renderSemesterSummaries();
}

// --- 4. ADD COURSE ---
function addCourseToTable() {
    const semester = document.getElementById('semesterSelect').value;
    const code = document.getElementById('courseCode').value.toUpperCase();
    let rawScore = document.getElementById('courseScore').value;
    const score = Math.round(parseFloat(rawScore)); 
    const unit = document.getElementById('courseUnit').value;
// FINAL FIX: Cap the score at 100 to prevent typos like "150"
    if (score > 100) score = 100;
    if (score < 0) score = 0;
    if(code === '' || rawScore === '' || unit === '') {
        alert("Please fill in all details!");
        return;
    }

    // NOTE: We do NOT calculate points here anymore. 
    // We save the raw SCORE. Points are calculated dynamically during render.
    const course = {
        id: Date.now(),
        semester: semester,
        code: code,
        score: score,
        unit: parseInt(unit)
    };

    courseList.push(course);
    saveData();
    renderTable();
    renderSemesterSummaries(); 
    
    // Clear inputs
    document.getElementById('courseCode').value = '';
    document.getElementById('courseScore').value = '';
    document.getElementById('courseUnit').value = '';
}

function deleteCourse(id) {
    if(confirm("Delete this course?")) {
        courseList = courseList.filter(item => item.id !== id);
        saveData();
        renderTable();
        renderSemesterSummaries(); 
    }
}

function clearAllData() {
    if(confirm("⚠️ Are you sure you want to wipe ALL data? This cannot be undone.")) {
        localStorage.removeItem("myGrades");
        courseList = [];
        renderTable();
        renderSemesterSummaries();
    }
}

// --- 5. RENDER TABLE (THE BRAIN) ---
function renderTable(dataToRender = courseList) {
    const tableBody = document.getElementById('courseTableBody');
    tableBody.innerHTML = ''; 
    let totalUnits = 0;
    let totalQP = 0;

    // Get Current Grading Standard
    const standardKey = document.getElementById('gradingStandard').value; // 'ng', 'us', or 'in'
    const system = GRADING_SYSTEMS[standardKey];

    // Update Max Scale UI
    document.getElementById('maxScaleDisplay').innerText = system.max.toFixed(2);

    dataToRender.sort((a, b) => parseFloat(a.semester) - parseFloat(b.semester));

    dataToRender.forEach(course => {
        // Calculate Points/Grade dynamically based on current system
        const result = calculateGradeAndPoints(course.score, system);
        
        // Calculate QP for this row
        const rowQP = course.unit * result.points;

        // Add to Totals
        totalUnits += course.unit;
        totalQP += rowQP;

        const row = `
            <tr class="animate-row">
                <td>${course.semester}</td> 
                <td>${course.code}</td>
                <td>${course.unit}</td>
                <td>${course.score}</td>
                <td style="color: ${getGradeColor(result.grade)}">${result.grade}</td>
                <td>${result.points}</td>
                <td>${rowQP}</td>
                <td><button class="delete-btn" onclick="deleteCourse(${course.id})">X</button></td>
            </tr>`;
        tableBody.innerHTML += row;
    });

    let gpa = 0;
    if (totalUnits > 0) gpa = totalQP / totalUnits;

    document.getElementById('gpaScore').innerText = gpa.toFixed(2);
    document.getElementById('targetCurrentCGPA').innerText = gpa.toFixed(2);
    
    updateGPAColor(gpa, system.max);
    renderChart(system); // Pass system to chart
    
    // Confetti if GPA is Top Tier (Top 10% of scale)
    if(gpa >= (system.max * 0.9)) {
        triggerConfetti();
    }
}

// --- 6. DYNAMIC GRADING LOGIC ---
function calculateGradeAndPoints(score, system) {
    let points = 0;
    let grade = 'F';

    // --- STANDARD 5.0 SCALE ---
    if (system.type === '5.0_ng') {
        if (score >= 70) { points = 5; grade = 'A'; }
        else if (score >= 60) { points = 4; grade = 'B'; }
        else if (score >= 50) { points = 3; grade = 'C'; }
        else if (score >= 45) { points = 2; grade = 'D'; }
        else if (score >= 40) { points = 1; grade = 'E'; }
        else { points = 0; grade = 'F'; }
    } 
    // --- SPECIAL 7.0 SCALE (Postgraduate / Old) ---
    // A (70+) = 7pts, A- (65-69) = 6pts, etc.
    else if (system.type === '7.0_special') {
        if (score >= 70) { points = 7; grade = 'A'; }
        else if (score >= 65) { points = 6; grade = 'A-'; }
        else if (score >= 60) { points = 5; grade = 'B+'; }
        else if (score >= 55) { points = 4; grade = 'B'; }
        else if (score >= 50) { points = 3; grade = 'B-'; }
        else if (score >= 45) { points = 2; grade = 'C+'; }
        else if (score >= 40) { points = 1; grade = 'C'; }
        else { points = 0; grade = 'F'; }
    }
    // --- NIGERIAN POLYTECHNIC (4.0) ---
    else if (system.type === '4.0_poly') {
        if (score >= 75) { points = 4.00; grade = 'A'; } 
        else if (score >= 70) { points = 3.50; grade = 'AB'; }
        else if (score >= 65) { points = 3.25; grade = 'B'; }
        else if (score >= 60) { points = 3.00; grade = 'BC'; }
        else if (score >= 55) { points = 2.75; grade = 'C'; }
        else if (score >= 50) { points = 2.50; grade = 'CD'; }
        else if (score >= 45) { points = 2.25; grade = 'D'; }
        else if (score >= 40) { points = 2.00; grade = 'E'; }
        else { points = 0.00; grade = 'F'; }
    }
    // --- USA (4.0) ---
    else if (system.type === '4.0_us') {
        if (score >= 90) { points = 4.0; grade = 'A'; }
        else if (score >= 80) { points = 3.0; grade = 'B'; }
        else if (score >= 70) { points = 2.0; grade = 'C'; }
        else if (score >= 60) { points = 1.0; grade = 'D'; }
        else { points = 0; grade = 'F'; }
    }
    // --- INDIA (10.0) ---
    else if (system.type === '10.0') {
        if (score >= 80) { points = 10; grade = 'O'; }
        else if (score >= 70) { points = 9; grade = 'A+'; }
        else if (score >= 60) { points = 8; grade = 'A'; }
        else if (score >= 55) { points = 7; grade = 'B+'; }
        else if (score >= 50) { points = 6; grade = 'B'; }
        else if (score >= 45) { points = 5; grade = 'C'; }
        else if (score >= 40) { points = 4; grade = 'P'; }
        else { points = 0; grade = 'F'; }
    }
    
    return { points, grade };
}

// --- 7. VISUALIZATIONS ---
function renderSemesterSummaries() {
    const container = document.getElementById('semester-summaries');
    container.innerHTML = ''; 
    const semesterGroups = {};

    const standardKey = document.getElementById('gradingStandard').value;
    const system = GRADING_SYSTEMS[standardKey];

    courseList.forEach(course => {
        if (!semesterGroups[course.semester]) semesterGroups[course.semester] = { units: 0, qp: 0 };
        const result = calculateGradeAndPoints(course.score, system);
        semesterGroups[course.semester].units += course.unit;
        semesterGroups[course.semester].qp += (course.unit * result.points);
    });

    Object.keys(semesterGroups).sort().forEach(sem => {
        const data = semesterGroups[sem];
        const semGPA = (data.qp / data.units).toFixed(2);
        
        // Dynamic Coloring
        let statusClass = 'status-red';
        if(semGPA >= (system.max * 0.7)) statusClass = 'status-green';
        else if(semGPA >= (system.max * 0.5)) statusClass = 'status-orange';

        container.innerHTML += `
            <div class="summary-card">
                <div class="summary-sem">Year ${sem}</div>
                <div class="summary-gpa ${statusClass}">${semGPA}</div>
            </div>`;
    });
}

function renderChart(system) {
    const ctx = document.getElementById('gpaChart').getContext('2d');
    
    // FINAL FIX: If no courses, destroy chart and exit (cleaner look)
    if (courseList.length === 0) {
        if (myChart) myChart.destroy();
        return;
    }

    const semesterGroups = {};
    
    courseList.forEach(course => {
        if (!semesterGroups[course.semester]) semesterGroups[course.semester] = { units: 0, qp: 0 };
        const result = calculateGradeAndPoints(course.score, system);
        semesterGroups[course.semester].units += course.unit;
        semesterGroups[course.semester].qp += (course.unit * result.points);
    });

    const labels = Object.keys(semesterGroups).sort(); 
    const dataPoints = labels.map(sem => {
        const data = semesterGroups[sem];
        return (data.qp / data.units).toFixed(2);
    });

    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels, 
            datasets: [{
                label: 'GPA Trend',
                data: dataPoints,
                borderColor: '#00b894', 
                backgroundColor: 'rgba(0, 184, 148, 0.2)', 
                borderWidth: 3,
                tension: 0.4, 
                fill: true, // Added fill for better look
                pointBackgroundColor: '#ffffff',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, max: system.max, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white' } },
                x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'white' } }
            },
            plugins: { legend: { labels: { color: 'white' } } }
        }
    });
}

// --- 8. HELPERS ---
function calculateTarget() {
    const standardKey = document.getElementById('gradingStandard').value;
    const system = GRADING_SYSTEMS[standardKey];

    let totalUnits = 0, totalQP = 0;
    courseList.forEach(c => { 
        totalUnits += c.unit; 
        const result = calculateGradeAndPoints(c.score, system);
        totalQP += (c.unit * result.points);
    });

    const target = parseFloat(document.getElementById('targetGPA').value);
    const nextUnits = parseFloat(document.getElementById('nextUnits').value);
    const resultText = document.getElementById('targetResult');

    if (!target || !nextUnits) {
        resultText.innerText = "Please enter both a Goal and Next Units.";
        resultText.style.color = "#ff7675";
        return;
    }

    const requiredGPA = ((target * (totalUnits + nextUnits)) - totalQP) / nextUnits;

    if (requiredGPA > system.max) {
        resultText.innerHTML = `⚠️ Impossible! You need <u>${requiredGPA.toFixed(2)}</u> (Max is ${system.max}).`;
        resultText.style.color = "#ff7675"; 
    } else if (requiredGPA < 0) {
        resultText.innerHTML = `🎉 You're already above this target!`;
        resultText.style.color = "#00b894"; 
    } else {
        resultText.innerHTML = `🎯 Aim for <u>${requiredGPA.toFixed(2)}</u> next semester.`;
        resultText.style.color = "#ffffff";
    }
}

function saveData() { localStorage.setItem("myGrades", JSON.stringify(courseList)); }

function getGradeColor(grade) {
    if (grade === 'A' || grade === 'O' || grade === 'A+') return '#00b894';
    if (grade === 'B' || grade === 'C' || grade === 'B+') return '#fdcb6e';
    return '#ff7675';
}

function updateGPAColor(gpa, max) {
    const resultArea = document.getElementById('result-area');
    const gpaText = document.getElementById('gpaScore');
    resultArea.className = ''; gpaText.className = ''; 

    if (gpa >= (max * 0.7)) { resultArea.classList.add('status-green'); gpaText.classList.add('status-green'); }
    else if (gpa >= (max * 0.5)) { resultArea.classList.add('status-orange'); gpaText.classList.add('status-orange'); }
    else { resultArea.classList.add('status-red'); gpaText.classList.add('status-red'); }
    
    gpaText.classList.remove('animate-pop');
    void gpaText.offsetWidth; 
    gpaText.classList.add('animate-pop');
}

function filterTable() {
    const filterValue = document.getElementById('filterSelect').value;
    renderTable(filterValue === 'all' ? courseList : courseList.filter(c => c.semester === filterValue)); 
}

// --- 9. PROFILE MODULE ---
const nameInput = document.getElementById('studentName');
const schoolInput = document.getElementById('studentSchool');
const durationInput = document.getElementById('programDuration'); 
const imgInput = document.getElementById('imageInput');
const profileImg = document.getElementById('profile-img');
const gradingInput = document.getElementById('gradingStandard'); // Save this preference

function loadProfile() {
    const savedProfile = JSON.parse(localStorage.getItem("studentProfile"));
    if (savedProfile) {
        if(savedProfile.name) nameInput.value = savedProfile.name;
        if(savedProfile.school) schoolInput.value = savedProfile.school;
        if(savedProfile.duration) { durationInput.value = savedProfile.duration; updateSemesterOptions(); }
        if(savedProfile.system) { gradingInput.value = savedProfile.system; } // Load Grading Pref
        if(savedProfile.image) profileImg.src = savedProfile.image;
    }
}

function saveProfile() {
    localStorage.setItem("studentProfile", JSON.stringify({
        name: nameInput.value,
        school: schoolInput.value,
        duration: durationInput.value,
        system: gradingInput.value, // Save Grading Pref
        image: profileImg.src
    }));
}

nameInput.addEventListener('input', saveProfile);
schoolInput.addEventListener('input', saveProfile);
gradingInput.addEventListener('change', () => { saveProfile(); recalculateAll(); }); // Save & Recalc
durationInput.addEventListener('change', () => { saveProfile(); updateSemesterOptions(); });
profileImg.addEventListener('click', () => imgInput.click());
imgInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) { profileImg.src = e.target.result; saveProfile(); };
        reader.readAsDataURL(file); 
    }
});

function triggerConfetti() {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
}
