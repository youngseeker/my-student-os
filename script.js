// --- GLOBAL VARIABLES ---
let courseList = []; 
let myChart = null; 

// CONFIG: Grading Standards
const GRADING_SYSTEMS = {
    'ng': { type: '5.0_ng', max: 5 }, 
    'ui': { type: '7.0_special', max: 7 },
    'poly': { type: '4.0_poly', max: 4 },
    'uk': { type: '4.0_uk', max: 4.0 },
    'us': { type: '4.0_us', max: 4 },
    'in': { type: '10.0', max: 10 }
};

const button = document.getElementById('addBtn');
button.addEventListener('click', addCourseToTable);

// --- 1. INITIALIZATION ---
window.onload = function() {
    // 1. Load Grades
    const savedData = localStorage.getItem("myGrades");
    if (savedData) {
        courseList = JSON.parse(savedData);
    }
    
    // 2. Load Profile & Settings (Just sets the values, doesn't calculate)
    loadProfile(); 
    
    // 3. Update Dropdowns based on loaded settings
    updateSemesterOptions();
    
    // 4. NOW it is safe to calculate and render everything
    recalculateAll(); 
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
    // 1. Re-render the data
    renderTable();
    renderSemesterSummaries();

    // 2. Update Input Placeholder based on System
    const systemKey = document.getElementById('gradingStandard').value;
    const inputField = document.getElementById('courseScore');

    switch(systemKey) {
        case 'ng': inputField.placeholder = "Score (0-100) or Grade (A, B, C...)"; break;
        case 'poly': inputField.placeholder = "Score (0-100) or Grade (A, AB, B...)"; break;
        case 'ui': inputField.placeholder = "Score (0-100) or Grade (A, A-, B+...)"; break;
        case 'us': inputField.placeholder = "Score (0-100) or Grade (A, B, C...)"; break;
        case 'in': inputField.placeholder = "Score (0-100) or Grade (O, A+, A...)"; break;
        case 'uk': inputField.placeholder = "Score (0-100) or Grade (1st, 2:1...)"; break;
        default: inputField.placeholder = "Score (0-100) or Grade";
    }
}

// --- 4. ADD COURSE ---
function addCourseToTable() {
    const semester = document.getElementById('semesterSelect').value;
    const code = document.getElementById('courseCode').value.toUpperCase();
    const unit = document.getElementById('courseUnit').value;
    let rawScoreInput = document.getElementById('courseScore').value.trim();

    // DUPLICATE CHECK
    const exists = courseList.some(c => c.code === code && c.semester === semester);
    if (exists) {
        alert(`⚠️ Duplicate Warning:\n\nYou have already added ${code} to this semester.`);
        return; 
    }

    if(code === '' || rawScoreInput === '' || unit === '') {
        alert("Please fill in all details!");
        return;
    }

    let finalScore;
    
    // CHECK: Is the input a Number or a Letter?
    if (!isNaN(rawScoreInput)) {
        finalScore = Math.round(parseFloat(rawScoreInput));
    } else {
        const standardKey = document.getElementById('gradingStandard').value;
        const system = GRADING_SYSTEMS[standardKey];
        finalScore = getScoreFromGrade(rawScoreInput, system.type);
        
        if (finalScore === -1) {
            alert(`The grade "${rawScoreInput}" is not valid for the selected grading system.`);
            return;
        }
    }

    // Safety Checks
    if (finalScore > 100) finalScore = 100;
    if (finalScore < 0) finalScore = 0;
    if (parseInt(unit) <= 0) { alert("Units must be positive"); return; }

    const course = {
        id: Date.now(),
        semester: semester,
        code: code,
        score: finalScore, 
        unit: parseInt(unit)
    };

    courseList.push(course);
    saveData();
    renderTable();
    renderSemesterSummaries(); 
    
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

    const standardKey = document.getElementById('gradingStandard').value; 
    const system = GRADING_SYSTEMS[standardKey];

    document.getElementById('maxScaleDisplay').innerText = system.max.toFixed(2);

    // EMPTY STATE CHECK
    if (dataToRender.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding: 2rem; color: #b2bec3;">
                    <h3>📭 No courses added yet</h3>
                    <p>Select a semester and add your first course above!</p>
                </td>
            </tr>`;
        if (myChart) myChart.destroy();
        document.getElementById('gpaScore').innerText = "0.00";
        const resultArea = document.getElementById('result-area');
        const gpaText = document.getElementById('gpaScore');
        resultArea.className = ''; 
        gpaText.className = '';
        return; 
    }

    dataToRender.sort((a, b) => parseFloat(a.semester) - parseFloat(b.semester));

    dataToRender.forEach(course => {
        const result = calculateGradeAndPoints(course.score, system);
        // This was the missing function causing the crash!
        const gradeColor = getColorForScore(course.score, system.type);
        const rowQP = course.unit * result.points;

        totalUnits += course.unit;
        totalQP += rowQP;

        const row = `
            <tr class="animate-row">
                <td>${course.semester}</td> 
                <td>${course.code}</td>
                <td>${course.unit}</td>
                <td>${course.score}</td>
                <td style="color: ${gradeColor}; font-weight: 800;">${result.grade}</td>
                <td>${result.points}</td>
                <td>${rowQP.toFixed(2)}</td>
                <td><button class="delete-btn" onclick="deleteCourse(${course.id})">X</button></td>
            </tr>`;
        tableBody.innerHTML += row;
    });

    let gpa = 0;
    if (totalUnits > 0) gpa = totalQP / totalUnits;

    document.getElementById('gpaScore').innerText = gpa.toFixed(2);
    document.getElementById('targetCurrentCGPA').innerText = gpa.toFixed(2);
    
    updateGPAColor(gpa, system.max);
    renderChart(system); 
    
    if(gpa >= (system.max * 0.9)) {
        triggerConfetti();
    }
}

// --- 6. DYNAMIC GRADING LOGIC ---
function calculateGradeAndPoints(score, system) {
    let points = 0;
    let grade = 'F';

    if (system.type === '5.0_ng') {
        if (score >= 70) { points = 5; grade = 'A'; }
        else if (score >= 60) { points = 4; grade = 'B'; }
        else if (score >= 50) { points = 3; grade = 'C'; }
        else if (score >= 45) { points = 2; grade = 'D'; }
        else if (score >= 40) { points = 1; grade = 'E'; }
        else { points = 0; grade = 'F'; }
    } 
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
    else if (system.type === '4.0_uk') {
        if (score >= 70) { points = 4.00; grade = '1st'; }
        else if (score >= 60) { points = 3.33; grade = '2:1'; }
        else if (score >= 50) { points = 2.67; grade = '2:2'; }
        else if (score >= 40) { points = 2.00; grade = '3rd'; }
        else { points = 0.00; grade = 'Fail'; }
    }
    else if (system.type === '4.0_us') {
        if (score >= 90) { points = 4.0; grade = 'A'; }
        else if (score >= 80) { points = 3.0; grade = 'B'; }
        else if (score >= 70) { points = 2.0; grade = 'C'; }
        else if (score >= 60) { points = 1.0; grade = 'D'; }
        else { points = 0; grade = 'F'; }
    }
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

// --- 7. HELPER: COLOR LOGIC (THIS WAS MISSING BEFORE) ---
function getColorForScore(score, systemType) {
    // Nigeria (5.0), Poly (4.0) & UI (7.0)
    if (systemType === '5.0_ng' || systemType === '4.0_poly' || systemType === '7.0_special') {
        if (score >= 60) return '#00b894'; // Green
        if (score >= 40) return '#fdcb6e'; // Orange
        return '#ff7675';                  // Red
    }
    // USA (4.0)
    else if (systemType === '4.0_us') {
        if (score >= 80) return '#00b894'; 
        if (score >= 60) return '#fdcb6e'; 
        return '#ff7675';                  
    }
    // UK (Percentage)
    else if (systemType === '4.0_uk') {
        if (score >= 60) return '#00b894'; // 1st & 2:1
        if (score >= 40) return '#fdcb6e'; // 2:2 & 3rd
        return '#ff7675';                  
    }
    // India (10.0)
    else if (systemType === '10.0') {
        if (score >= 60) return '#00b894'; 
        if (score >= 40) return '#fdcb6e'; 
        return '#ff7675';                  
    }
    return '#ffffff';
}

// --- 8. HELPER: LETTER TO SCORE ---
function getScoreFromGrade(gradeInput, systemType) {
    const grade = gradeInput.toUpperCase().trim();
    
    if (systemType === '5.0_ng') {
        if (grade === 'A') return 70;
        if (grade === 'B') return 60;
        if (grade === 'C') return 50;
        if (grade === 'D') return 45;
        if (grade === 'E') return 40;
        if (grade === 'F') return 0;
    }
    else if (systemType === '7.0_special') {
        if (grade === 'A') return 70;
        if (grade === 'A-') return 65;
        if (grade === 'B+') return 60;
        if (grade === 'B') return 55;
        if (grade === 'B-') return 50;
        if (grade === 'C+') return 45;
        if (grade === 'C') return 40;
        if (grade === 'F') return 0;
    }
    else if (systemType === '4.0_poly') {
        if (grade === 'A') return 75;
        if (grade === 'AB') return 70;
        if (grade === 'B') return 65;
        if (grade === 'BC') return 60;
        if (grade === 'C') return 55;
        if (grade === 'CD') return 50;
        if (grade === 'D') return 45;
        if (grade === 'E') return 40;
        if (grade === 'F') return 0;
    }
    else if (systemType === '4.0_uk') {
        if (grade === '1ST') return 75;
        if (grade === '2:1') return 65;
        if (grade === '2:2') return 55;
        if (grade === '3RD') return 45;
        if (grade === 'FAIL') return 0;
    }
    else if (systemType === '4.0_us') {
        if (grade === 'A') return 90;
        if (grade === 'B') return 80;
        if (grade === 'C') return 70;
        if (grade === 'D') return 60;
        if (grade === 'F') return 0;
    }
    else if (systemType === '10.0') {
        if (grade === 'O') return 80;
        if (grade === 'A+') return 70;
        if (grade === 'A') return 60;
        if (grade === 'B+') return 55;
        if (grade === 'B') return 50;
        if (grade === 'C') return 45;
        if (grade === 'P') return 40;
        if (grade === 'F') return 0;
    }
    
    return -1; 
}

// --- 9. VISUALIZATIONS ---
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
                fill: true,
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

// --- 10. HELPERS ---
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

// --- 11. PROFILE MODULE ---
const nameInput = document.getElementById('studentName');
const schoolInput = document.getElementById('studentSchool');
const durationInput = document.getElementById('programDuration'); 
const imgInput = document.getElementById('imageInput');
const profileImg = document.getElementById('profile-img');
const gradingInput = document.getElementById('gradingStandard'); 

function loadProfile() {
    const savedProfile = JSON.parse(localStorage.getItem("studentProfile"));
    if (savedProfile) {
        if(savedProfile.name) nameInput.value = savedProfile.name;
        if(savedProfile.school) schoolInput.value = savedProfile.school;
        if(savedProfile.duration) durationInput.value = savedProfile.duration; 
        if(savedProfile.system) gradingInput.value = savedProfile.system; 
        if(savedProfile.image) profileImg.src = savedProfile.image;
    }
}

function saveProfile() {
    localStorage.setItem("studentProfile", JSON.stringify({
        name: nameInput.value,
        school: schoolInput.value,
        duration: durationInput.value,
        system: gradingInput.value,
        image: profileImg.src
    }));
}

nameInput.addEventListener('input', saveProfile);
schoolInput.addEventListener('input', saveProfile);
gradingInput.addEventListener('change', () => { saveProfile(); recalculateAll(); }); 
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

// --- NEW HELPER: Convert Letter Grade to Representative Score ---
function getScoreFromGrade(gradeInput, systemType) {
    const grade = gradeInput.toUpperCase().trim();
    
    // 1. Nigeria Standard (5.0)
    if (systemType === '5.0_ng') {
        if (grade === 'A') return 70;
        if (grade === 'B') return 60;
        if (grade === 'C') return 50;
        if (grade === 'D') return 45;
        if (grade === 'E') return 40;
        if (grade === 'F') return 0;
    }
    // 2. Special/PG (7.0)
    else if (systemType === '7.0_special') {
        if (grade === 'A') return 70;
        if (grade === 'A-') return 65;
        if (grade === 'B+') return 60;
        if (grade === 'B') return 55;
        if (grade === 'B-') return 50;
        if (grade === 'C+') return 45;
        if (grade === 'C') return 40;
        if (grade === 'F') return 0;
    }
    // 3. Polytechnic (4.0)
    else if (systemType === '4.0_poly') {
        if (grade === 'A') return 75;
        if (grade === 'AB') return 70;
        if (grade === 'B') return 65;
        if (grade === 'BC') return 60;
        if (grade === 'C') return 55;
        if (grade === 'CD') return 50;
        if (grade === 'D') return 45;
        if (grade === 'E') return 40;
        if (grade === 'F') return 0;
    }
    // Add this else if block
else if (systemType === '4.0_uk') {
    if (grade === '1ST') return 75;
    if (grade === '2:1') return 65;
    if (grade === '2:2') return 55;
    if (grade === '3RD') return 45;
    if (grade === 'FAIL') return 0;
}
    // 4. USA (4.0)
    else if (systemType === '4.0_us') {
        if (grade === 'A') return 90; // Standard midpoint or min
        if (grade === 'B') return 80;
        if (grade === 'C') return 70;
        if (grade === 'D') return 60;
        if (grade === 'F') return 0;
    }
    // 5. India (10.0)
    else if (systemType === '10.0') {
        if (grade === 'O') return 80;
        if (grade === 'A+') return 70;
        if (grade === 'A') return 60;
        if (grade === 'B+') return 55;
        if (grade === 'B') return 50;
        if (grade === 'C') return 45;
        if (grade === 'P') return 40;
        if (grade === 'F') return 0;
    }
    
    return -1; // Return -1 if invalid grade found
}
