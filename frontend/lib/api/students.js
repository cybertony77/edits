import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../axios';

// Query keys for students
export const studentKeys = {
  all: ['students'],
  lists: () => [...studentKeys.all, 'list'],
  list: (filters) => [...studentKeys.lists(), { filters }],
  details: () => [...studentKeys.all, 'detail'],
  detail: (id) => [...studentKeys.details(), id],
  history: () => [...studentKeys.all, 'history'],
};

// API functions
const studentsApi = {
  // Get all students
  getAll: async () => {
    const response = await apiClient.get('/api/students');
    return response.data;
  },

  // Get student by ID
  getById: async (id) => {
    const response = await apiClient.get(`/api/students/${id}`);
    return response.data;
  },

  // Get student history
  getHistory: async () => {
    const response = await apiClient.get('/api/students/history');
    return response.data;
  },

  // Create new student
  create: async (studentData) => {
    const response = await apiClient.post('/api/students', studentData);
    return response.data;
  },

  // Update student
  update: async (id, updateData) => {
    const response = await apiClient.put(`/api/students/${id}`, updateData);
    return response.data;
  },

  // Delete student
  delete: async (id) => {
    const response = await apiClient.delete(`/api/students/${id}`);
    return response.data;
  },

  // Save payment for student
  savePayment: async (paymentData) => {
    const response = await apiClient.post('/api/payments', paymentData);
    return response.data;
  },

  // Clear payment for student
  clearPayment: async (paymentData) => {
    const response = await apiClient.post('/api/payments', paymentData);
    return response.data;
  },

  // Save mock exam for student
  saveMockExam: async (mockExamData) => {
    const response = await apiClient.post('/api/mock-exams', mockExamData);
    return response.data;
  },

  // Toggle attendance (mark as attended or unattended)
  toggleAttendance: async (id, attendanceData) => {
    const response = await apiClient.post(`/api/students/${id}/attend`, attendanceData);
    return response.data;
  },

  // Legacy function for backward compatibility
  markAttendance: async (id, attendanceData) => {
    const response = await apiClient.post(`/api/students/${id}/attend`, attendanceData);
    return response.data;
  },

  // Update homework status
  updateHomework: async (id, homeworkData) => {
    const response = await apiClient.post(`/api/students/${id}/hw`, homeworkData);
    return response.data;
  },

  // Update homework degree
  updateHomeworkDegree: async (id, homeworkDegreeData) => {
    const response = await apiClient.post(`/api/students/${id}/homework_degree`, homeworkDegreeData);
    return response.data;
  },

  
  // Update quiz grade
  updateQuizGrade: async (id, quizData) => {
    const response = await apiClient.post(`/api/students/${id}/quiz_degree`, quizData);
    return response.data;
  },

  // Send WhatsApp message
  sendWhatsApp: async (id, messageData) => {
    const response = await apiClient.post(`/api/students/${id}/send-whatsapp`, messageData);
    return response.data;
  },

  // Update message state
  updateMessageState: async (id, message_state, lesson, isStudentMessage = false) => {
    const response = await apiClient.post(`/api/students/${id}/update-message-state`,
      { message_state, lesson, isStudentMessage }
    );
    return response.data;
  },

  // Update weekly comment
  updateWeekComment: async (id, comment, lesson) => {
    const response = await apiClient.post(`/api/students/${id}/comment`,
      { comment, lesson }
    );
    return response.data;
  },

  // Get student by ID (public access with HMAC)
  getByIdPublic: async (id, signature) => {
    const response = await apiClient.get(`/api/students/public/${id}?sig=${signature}`);
    return response.data;
  },
};

// React Query hooks
export const useStudents = (filters = {}, options = {}) => {
  return useQuery({
    queryKey: studentKeys.list(filters),
    queryFn: () => studentsApi.getAll(),
    ...options, // Spread the options to allow custom configuration
  });
};

export const useStudent = (id, options = {}) => {
  return useQuery({
    queryKey: studentKeys.detail(id),
    queryFn: () => studentsApi.getById(id),
    enabled: !!id,
    ...options, // Spread the options to allow custom configuration
  });
};

export const useStudentPublic = (id, signature, options = {}) => {
  return useQuery({
    queryKey: [...studentKeys.detail(id), 'public', signature],
    queryFn: () => studentsApi.getByIdPublic(id, signature),
    enabled: !!id && !!signature,
    ...options, // Spread the options to allow custom configuration
  });
};

export const useStudentsHistory = (options = {}) => {
  return useQuery({
    queryKey: studentKeys.history(),
    queryFn: () => studentsApi.getHistory(),
    ...options, // Spread the options to allow custom configuration
  });
};

// Mutations
export const useCreateStudent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (studentData) =>
      studentsApi.create(studentData),
    onSettled: async () => {
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

export const useUpdateStudent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updateData }) =>
      studentsApi.update(id, updateData),
    onSettled: async (_, __, { id, updateData }) => {
      console.log('📝 Student Updated - Invalidating caches:', {
        studentId: id,
        updatedFields: Object.keys(updateData),
        updateData
      });
      
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

export const useDeleteStudent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) =>
      studentsApi.delete(id, ),
    onSettled: async (_, __, id) => {
      console.log('🗑️ Student Deleted - Invalidating all caches:', {
        deletedStudentId: id
      });
      
      // Invalidate the specific student detail query so any active viewers get 404
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      
      // Also remove the query after invalidation to clean up cache
      setTimeout(() => {
        queryClient.removeQueries({ queryKey: studentKeys.detail(id) });
      }, 1000);
      
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

export const useToggleAttendance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, attendanceData }) =>
      studentsApi.toggleAttendance(id, attendanceData, ),
    onSettled: async (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

// Legacy hook for backward compatibility
export const useMarkAttendance = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, attendanceData }) =>
      studentsApi.markAttendance(id, attendanceData, ),
    onSettled: async (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

export const useUpdateHomework = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, homeworkData }) =>
      studentsApi.updateHomework(id, homeworkData, ),
    onSettled: async (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

export const useUpdateHomeworkDegree = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, homeworkDegreeData }) =>
      studentsApi.updateHomeworkDegree(id, homeworkDegreeData),
    onSettled: async (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

 
export const useUpdateQuizGrade = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, quizData }) =>
      studentsApi.updateQuizGrade(id, quizData, ),
    onSettled: async (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

export const useSendWhatsApp = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, messageData }) => studentsApi.sendWhatsApp(id, messageData, ),
    onSettled: async (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

export const useUpdateMessageState = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, message_state, lesson, isStudentMessage }) => {
      return studentsApi.updateMessageState(id, message_state, lesson, isStudentMessage);
    },
    onSettled: async (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

export const useUpdateWeekComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, comment, lesson }) =>
      studentsApi.updateWeekComment(id, comment, lesson),
    onSettled: async (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentKeys.history() });
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'students'
      });
    },
  });
};

export const useSaveMockExam = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (mockExamData) => studentsApi.saveMockExam(mockExamData),
    onSettled: async (_, __, { studentId }) => {
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      await queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'students' 
      });
    },
  });
};

export const useSavePayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentData) => studentsApi.savePayment(paymentData),
    onSettled: async (_, __, { studentId }) => {
      // Invalidate the specific student's data
      queryClient.invalidateQueries({ queryKey: studentKeys.detail(studentId) });
      // Invalidate all students list to update any cached data
      queryClient.invalidateQueries({ queryKey: studentKeys.lists() });
      // Invalidate all student-related queries
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'students'
      });
    },
  });
};

